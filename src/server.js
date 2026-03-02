const path = require("node:path");

require("dotenv").config();

const express = require("express");

const { createElasticsearchClientFromEnv, ensureJobsIndex } = require("./services/elasticsearch");
const { acceptJob, createJob, getJob, searchJobs, toNumber, toStringArrayCsv } = require("./services/jobs");
const { geocodeAddress } = require("./services/geocoding");

const app = express();

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

    const jobPayload = { ...payload, ...(address ? { address } : {}) };

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

  const lat = toNumber(req.query.lat);
  const lon = toNumber(req.query.lon);
  if (lat === null || lon === null) return res.status(400).json({ error: "lat and lon are required" });

  const radius = typeof req.query.radius === "string" && req.query.radius.trim() ? req.query.radius.trim() : "5km";
  const skills = toStringArrayCsv(req.query.skills);

  try {
    const results = await searchJobs({
      client,
      indexName: app.locals.jobsIndex,
      lat,
      lon,
      radius,
      skills
    });
    return res.json(results);
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
