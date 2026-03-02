const path = require("node:path");

require("dotenv").config();

const express = require("express");

const { createElasticsearchClientFromEnv, ensureJobsIndex } = require("./services/elasticsearch");
const {
  acceptJob,
  createJob,
  getJob,
  searchJobs,
  searchJobsAlongRoute,
  toNumber,
  toStringArrayCsv
} = require("./services/jobs");
const { structureJobFromIssue } = require("./services/issue-structuring");
const { geocodeAddress } = require("./services/geocoding");
const { getDrivingRoute, sampleRoutePointsFromLineString } = require("./services/routing");

const app = express();

function toDebugMode(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "on", "journey", "route"].includes(raw);
}

function shouldDebugRequest(req) {
  return (
    toDebugMode(req.query.debug) ||
    toDebugMode(req.query.debugJourney) ||
    toDebugMode(req.headers["x-debug-journey"])
  );
}

function logJourneyDebug(payload) {
  if (!payload?.enabled) return;
  console.log("[OMJ Journey]", JSON.stringify(payload, null, 2));
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/health", async (_req, res) => {
  const client = app.locals.esClient ?? null;
  if (!client) return res.json({ ok: true, elasticsearch: { configured: false } });

  try {
    await client.ping();
    return res.json({ ok: true, elasticsearch: { configured: true, reachable: true } });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      elasticsearch: { configured: true, reachable: false },
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/config", (_req, res) => {
  const googleMapsApiKey =
    typeof process.env.GOOGLE_MAPS_API_KEY === "string" && process.env.GOOGLE_MAPS_API_KEY.trim()
      ? process.env.GOOGLE_MAPS_API_KEY.trim()
      : null;

  return res.json({
    googleMapsApiKey
  });
});

app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/customer", (_req, res) => res.sendFile(path.join(publicDir, "customer.html")));
app.get("/tradie", (_req, res) => res.sendFile(path.join(publicDir, "tradie.html")));
app.get("/jobs/:id", (_req, res) => res.sendFile(path.join(publicDir, "job.html")));

app.post("/api/jobs", async (req, res) => {
  const client = app.locals.esClient ?? null;
  if (!client) return res.status(500).json({ error: "Elasticsearch is not configured" });

  try {
    const payload = req.body ?? {};
    const address = typeof payload.address === "string" ? payload.address.trim() : "";
    const issue =
      typeof payload.issue === "string" && payload.issue.trim()
        ? payload.issue.trim()
        : typeof payload.description === "string" && payload.description.trim()
          ? payload.description.trim()
          : "";

    const jobPayload = { ...payload, ...(address ? { address } : {}) };
    const structured = issue ? await structureJobFromIssue(issue) : null;
    if (structured) {
      if (structured?.title && !jobPayload.title) jobPayload.title = structured.title;
      if (structured?.description && !jobPayload.description) jobPayload.description = structured.description;
      if (Array.isArray(structured?.skills) && structured.skills.length > 0 && !jobPayload.skills)
        jobPayload.skills = structured.skills;
      if (Array.isArray(structured?.tools) && structured.tools.length > 0 && !jobPayload.tools)
        jobPayload.tools = structured.tools;
      if (issue && !jobPayload.issue) jobPayload.issue = issue;
    }

    if (!jobPayload.title) {
      throw new Error("title is required (add title or description field)");
    }

    const lat = toNumber(jobPayload.lat ?? jobPayload.location?.lat);
    const lon = toNumber(jobPayload.lon ?? jobPayload.location?.lon);

    if (lat === null || lon === null) {
      if (!address) throw new Error("address is required (or provide lat/lon)");
      const geo = await geocodeAddress(address);
      jobPayload.location = { lat: geo.lat, lon: geo.lon };
      jobPayload.addressLabel = geo.label;
    }

    const job = await createJob({
      client,
      indexName: app.locals.jobsIndex,
      job: jobPayload
    });
    return res.status(201).json(job);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/jobs/nearby", async (req, res) => {
  const client = app.locals.esClient ?? null;
  if (!client) return res.status(500).json({ error: "Elasticsearch is not configured" });

  const radius = typeof req.query.radius === "string" && req.query.radius.trim() ? req.query.radius.trim() : "5km";
  const skills = toStringArrayCsv(req.query.skills);
  const address = typeof req.query.address === "string" ? req.query.address.trim() : "";

  try {
    let lat = toNumber(req.query.lat);
    let lon = toNumber(req.query.lon);
    let origin = null;

    if (lat === null || lon === null) {
      if (!address) throw new Error("address is required (or provide lat/lon)");
      const geo = await geocodeAddress(address);
      lat = geo.lat;
      lon = geo.lon;
      origin = geo;
    } else {
      origin = { lat, lon, label: null, provider: "coords" };
    }

    const results = await searchJobs({
      client,
      indexName: app.locals.jobsIndex,
      lat,
      lon,
      radius,
      skills
    });
    return res.json({ ...results, origin });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/geocode", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return res.status(400).json({ error: "q is required" });
    const geo = await geocodeAddress(q);
    return res.json(geo);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/jobs/route", async (req, res) => {
  const client = app.locals.esClient ?? null;
  if (!client) return res.status(500).json({ error: "Elasticsearch is not configured" });

  const skills = toStringArrayCsv(req.query.skills);
  const detourMinutesRaw = toNumber(req.query.detourMinutes ?? req.query.minutes);
  const detourMinutes = detourMinutesRaw === null ? 5 : detourMinutesRaw;

  if (detourMinutes < 0.5 || detourMinutes > 60) {
    return res.status(400).json({ error: "detourMinutes must be between 0.5 and 60" });
  }

  const avgSpeedKph = Math.max(5, toNumber(process.env.ROUTE_AVG_SPEED_KPH) ?? 40);
  const bufferKm = (detourMinutes * avgSpeedKph) / 60;
  const bufferDistance = `${bufferKm.toFixed(2)}km`;
  const debug = shouldDebugRequest(req);

  try {
    const startAddress =
      typeof req.query.start === "string"
        ? req.query.start.trim()
        : typeof req.query.startAddress === "string"
          ? req.query.startAddress.trim()
          : "";

    const destinationAddress =
      typeof req.query.destination === "string"
        ? req.query.destination.trim()
        : typeof req.query.end === "string"
          ? req.query.end.trim()
          : "";

    let lat = toNumber(req.query.lat);
    let lon = toNumber(req.query.lon);
    let endLat = toNumber(req.query.endLat);
    let endLon = toNumber(req.query.endLon);

    let start = null;
    let end = null;

    if (lat === null || lon === null) {
      if (!startAddress) throw new Error("start is required (or provide lat/lon)");
      const geo = await geocodeAddress(startAddress);
      lat = geo.lat;
      lon = geo.lon;
      start = geo;
    } else {
      start = { lat, lon, label: null, provider: "coords" };
    }

    if (endLat === null || endLon === null) {
      if (!destinationAddress) throw new Error("destination is required (or provide endLat/endLon)");
      const geo = await geocodeAddress(destinationAddress);
      endLat = geo.lat;
      endLon = geo.lon;
      end = geo;
    } else {
      end = { lat: endLat, lon: endLon, label: null, provider: "coords" };
    }

    const route = await getDrivingRoute({ start: { lat, lon }, end: { lat: endLat, lon: endLon } });
    logJourneyDebug({
      enabled: debug,
      stage: "route_requested",
      endpoint: "/api/jobs/route",
      startLat: lat,
      startLon: lon,
      endLat: endLat,
      endLon: endLon,
      detourMinutes,
      avgSpeedKph,
      bufferKm,
      routeDistanceM: route.distanceM,
      routeDurationS: route.durationS
    });

    const stepMeters = Math.max(300, Math.min(1500, bufferKm * 500));
    const routePoints = sampleRoutePointsFromLineString(route.geometry, {
      stepMeters,
      maxPoints: 80
    });

    const results = await searchJobsAlongRoute({
      client,
      indexName: app.locals.jobsIndex,
      routePoints,
      bufferDistance,
      skills,
      size: 50,
      avgSpeedKph
    });

    logJourneyDebug({
      enabled: debug,
      stage: "route_results",
      routePointCount: routePoints.length,
      routeGeometryType: route.geometry?.type,
      searchTotal: results.total,
      jobsReturned: results.jobs.length,
      routeDurationS: route.durationS,
      routeDistanceM: route.distanceM
    });

    return res.json({
      ...results,
      route: {
        distanceM: route.distanceM,
        durationS: route.durationS,
        geometry: route.geometry
      },
      start,
      end,
      detourMinutes,
      routeAvgSpeedKph: avgSpeedKph,
      bufferKm,
      bufferDistance,
      routePoints: routePoints.length
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/jobs/:id", async (req, res) => {
  const client = app.locals.esClient ?? null;
  if (!client) return res.status(500).json({ error: "Elasticsearch is not configured" });

  try {
    const job = await getJob({ client, indexName: app.locals.jobsIndex, id: req.params.id });
    if (!job) return res.status(404).json({ error: "Not found" });
    return res.json(job);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/jobs/:id/accept", async (req, res) => {
  const client = app.locals.esClient ?? null;
  if (!client) return res.status(500).json({ error: "Elasticsearch is not configured" });

  try {
    const job = await acceptJob({
      client,
      indexName: app.locals.jobsIndex,
      id: req.params.id,
      tradieName: req.body?.tradieName
    });
    return res.json(job);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

async function main() {
  const jobsIndex = process.env.ES_JOBS_INDEX?.trim() || "omj-jobs";

  const esClient = createElasticsearchClientFromEnv();
  if (esClient) {
    await ensureJobsIndex(esClient, jobsIndex);
    app.locals.esClient = esClient;
    app.locals.jobsIndex = jobsIndex;
  } else {
    app.locals.esClient = null;
    app.locals.jobsIndex = jobsIndex;
    console.warn("Elasticsearch not configured. Set ELASTICSEARCH_CLOUD_ID or ELASTICSEARCH_NODE.");
  }

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
