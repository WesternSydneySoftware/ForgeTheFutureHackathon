const { Client } = require("@elastic/elasticsearch");

function createElasticsearchClientFromEnv() {
  const cloudId = process.env.ELASTICSEARCH_CLOUD_ID?.trim();
  const node = process.env.ELASTICSEARCH_NODE?.trim();
  const apiKey = process.env.ELASTICSEARCH_API_KEY?.trim();
  const username = process.env.ELASTICSEARCH_USERNAME?.trim();
  const password = process.env.ELASTICSEARCH_PASSWORD?.trim();

  if (!cloudId && !node) return null;

  const auth = apiKey
    ? { apiKey }
    : username && password
      ? { username, password }
      : undefined;

  if (cloudId) return new Client({ cloud: { id: cloudId }, ...(auth ? { auth } : {}) });
  return new Client({ node, ...(auth ? { auth } : {}) });
}

async function ensureJobsIndex(client, indexName) {
  const existsResponse = await client.indices.exists({ index: indexName });
  const exists = typeof existsResponse === "boolean" ? existsResponse : existsResponse.body;
  if (exists) return;

  await client.indices.create({
    index: indexName,
    mappings: {
      properties: {
        title: { type: "text" },
        description: { type: "text" },
        skills: { type: "keyword" },
        tools: { type: "keyword" },
        status: { type: "keyword" },
        price: { type: "float" },
        address: { type: "text" },
        addressLabel: { type: "text" },
        seed: { type: "keyword" },
        location: { type: "geo_point" },
        createdAt: { type: "date" },
        acceptedAt: { type: "date" },
        acceptedBy: {
          properties: {
            name: { type: "keyword" }
          }
        }
      }
    }
  });
}

module.exports = { createElasticsearchClientFromEnv, ensureJobsIndex };
