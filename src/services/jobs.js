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

module.exports = { createJob, getJob, searchJobs, acceptJob, toStringArrayCsv, toNumber };
