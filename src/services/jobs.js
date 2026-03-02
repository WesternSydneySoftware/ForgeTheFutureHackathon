const crypto = require("node:crypto");

function toNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringArrayCsv(value) {
  if (value === null || value === undefined) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function createJob({ client, indexName, job }) {
  const title = toNonEmptyString(job.title);
  if (!title) throw new Error("title is required");

  const description = toNonEmptyString(job.description) ?? "";
  const lat = toNumber(job.lat ?? job.location?.lat);
  const lon = toNumber(job.lon ?? job.location?.lon);
  if (lat === null || lon === null) throw new Error("lat and lon are required");

  const skills = Array.isArray(job.skills) ? job.skills : toStringArrayCsv(job.skills);
  const tools = Array.isArray(job.tools) ? job.tools : toStringArrayCsv(job.tools);
  const price = toNumber(job.price);
  const customerName = toNonEmptyString(job.customerName) ?? null;
  const address = toNonEmptyString(job.address) ?? null;
  const addressLabel = toNonEmptyString(job.addressLabel) ?? null;

  const id = crypto.randomUUID();
  const document = {
    title,
    description,
    skills,
    tools,
    price,
    customerName,
    address,
    addressLabel,
    status: "open",
    location: { lat, lon },
    createdAt: new Date().toISOString()
  };

  await client.index({
    index: indexName,
    id,
    document,
    refresh: "wait_for"
  });

  return { id, ...document };
}

async function getJob({ client, indexName, id }) {
  const response = await client.get({ index: indexName, id });
  const body = response.body ?? response;
  const source = body._source ?? null;
  if (!source) return null;
  return { id: body._id ?? id, ...source };
}

async function searchJobs({ client, indexName, lat, lon, radius = "5km", skills = [], size = 25 }) {
  const filters = [
    { term: { status: "open" } },
    { geo_distance: { distance: radius, location: { lat, lon } } }
  ];

  if (skills.length > 0) filters.push({ terms: { skills } });

  const response = await client.search({
    index: indexName,
    size,
    query: { bool: { filter: filters } },
    sort: [
      {
        _geo_distance: {
          location: { lat, lon },
          order: "asc",
          unit: "km"
        }
      }
    ],
    track_total_hits: true
  });

  const body = response.body ?? response;
  const hits = body.hits?.hits ?? [];
  const total =
    typeof body.hits?.total === "number"
      ? body.hits.total
      : body.hits?.total?.value ?? hits.length;

  return {
    total,
    jobs: hits.map((hit) => ({
      id: hit._id,
      ...(hit._source ?? {}),
      distanceKm: Array.isArray(hit.sort) ? hit.sort[0] : null
    }))
  };
}

function degreesToRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistanceMeters(a, b) {
  const R = 6371e3;
  const φ1 = degreesToRadians(a.lat);
  const φ2 = degreesToRadians(b.lat);
  const Δφ = degreesToRadians(b.lat - a.lat);
  const Δλ = degreesToRadians(b.lon - a.lon);

  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const h = sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function minDistanceToPointsMeters(point, points) {
  let min = Infinity;
  for (const p of points) {
    const d = haversineDistanceMeters(point, p);
    if (d < min) min = d;
  }
  return min;
}

async function searchJobsAlongRoute({
  client,
  indexName,
  routePoints,
  bufferDistance = "3km",
  skills = [],
  size = 50,
  avgSpeedKph = 40
}) {
  const points = Array.isArray(routePoints) ? routePoints.filter(Boolean) : [];
  if (points.length === 0) throw new Error("routePoints are required");

  const filters = [{ term: { status: "open" } }];
  if (skills.length > 0) filters.push({ terms: { skills } });

  const numericAvgSpeedKph = toNumber(avgSpeedKph);
  const routeAvgSpeedKph = Number.isFinite(numericAvgSpeedKph) && numericAvgSpeedKph > 0 ? numericAvgSpeedKph : 40;

  const should = points.map((p) => ({
    geo_distance: { distance: bufferDistance, location: { lat: p.lat, lon: p.lon } }
  }));

  const response = await client.search({
    index: indexName,
    size,
    query: { bool: { filter: filters, should, minimum_should_match: 1 } },
    track_total_hits: true
  });

  const body = response.body ?? response;
  const hits = body.hits?.hits ?? [];
  const total =
    typeof body.hits?.total === "number"
      ? body.hits.total
      : body.hits?.total?.value ?? hits.length;

  const jobs = hits
    .map((hit) => {
      const source = hit._source ?? {};
      const loc = source.location ?? null;
      const lat = typeof loc?.lat === "number" ? loc.lat : toNumber(loc?.lat);
      const lon = typeof loc?.lon === "number" ? loc.lon : toNumber(loc?.lon);

      const routeDistanceKm =
        lat === null || lon === null
          ? null
          : minDistanceToPointsMeters({ lat, lon }, points) / 1000;

      const routeDetourMinutes =
        lat === null || lon === null ? null : (routeDistanceKm / routeAvgSpeedKph) * 60;

      return {
        id: hit._id,
        ...source,
        routeDistanceKm,
        routeDetourMinutes
      };
    })
    .sort((a, b) => {
      const da = typeof a.routeDistanceKm === "number" ? a.routeDistanceKm : Infinity;
      const db = typeof b.routeDistanceKm === "number" ? b.routeDistanceKm : Infinity;
      return da - db;
    });

  return { total, jobs };
}

async function acceptJob({ client, indexName, id, tradieName }) {
  const name = toNonEmptyString(tradieName);
  if (!name) throw new Error("tradieName is required");

  const existing = await getJob({ client, indexName, id });
  if (!existing) throw new Error("job not found");
  if (existing.status !== "open") throw new Error("job is not open");

  await client.update({
    index: indexName,
    id,
    doc: {
      status: "accepted",
      acceptedAt: new Date().toISOString(),
      acceptedBy: { name }
    },
    refresh: "wait_for"
  });

  return await getJob({ client, indexName, id });
}

module.exports = {
  createJob,
  getJob,
  searchJobs,
  searchJobsAlongRoute,
  acceptJob,
  toStringArrayCsv,
  toNumber
};
