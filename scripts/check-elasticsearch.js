require("dotenv").config();

const { createElasticsearchClientFromEnv, ensureJobsIndex } = require("../src/services/elasticsearch");

async function main() {
  const client = createElasticsearchClientFromEnv();
  if (!client) {
    console.error("Elasticsearch is not configured. Set ELASTICSEARCH_CLOUD_ID or ELASTICSEARCH_NODE.");
    process.exitCode = 1;
    return;
  }

  await client.ping();

  const jobsIndex = (process.env.ES_JOBS_INDEX || "omj-jobs").trim() || "omj-jobs";
  await ensureJobsIndex(client, jobsIndex);

  console.log("Elasticsearch OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

