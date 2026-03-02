require("dotenv").config();

const crypto = require("node:crypto");

const { createElasticsearchClientFromEnv, ensureJobsIndex } = require("../src/services/elasticsearch");

const SEED_NAME = "demo-nsw-v2";
const DEMO_JOB_COUNT = 1000;

function stableId(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function toIsoNow() {
  return new Date().toISOString();
}

function createRng(seed = 1337) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomChoice(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomPrice(rng, task) {
  return randomInt(rng, task.priceMin ?? 50, task.priceMax ?? 250);
}

function jitter(value, rng, maxJitter) {
  return value + (rng() - 0.5) * maxJitter * 2;
}

function buildAddress(area) {
  return `${area.suburb}, NSW`;
}

function makeJobDocument(job) {
  return {
    title: job.title,
    description: job.description,
    skills: job.skills,
    tools: job.tools,
    price: job.price ?? null,
    customerName: job.customerName ?? "Demo",
    address: job.address,
    addressLabel: job.addressLabel ?? job.address,
    status: "open",
    location: job.location,
    createdAt: toIsoNow(),
    seed: SEED_NAME
  };
}

const nswAreas = [
  { suburb: "Sydney CBD", lat: -33.8688, lon: 151.2093 },
  { suburb: "Surry Hills", lat: -33.8870, lon: 151.2100 },
  { suburb: "Parramatta", lat: -33.8170, lon: 151.0037 },
  { suburb: "Chatswood", lat: -33.7960, lon: 151.1810 },
  { suburb: "Bondi", lat: -33.8915, lon: 151.2767 },
  { suburb: "Newcastle", lat: -32.9271, lon: 151.7800 },
  { suburb: "Gosford", lat: -33.4250, lon: 151.3430 },
  { suburb: "Wollongong", lat: -34.4278, lon: 150.8931 },
  { suburb: "Port Kembla", lat: -34.4762, lon: 150.9060 },
  { suburb: "Wagga Wagga", lat: -35.1088, lon: 147.3594 },
  { suburb: "Albury", lat: -36.0748, lon: 146.9232 },
  { suburb: "Coffs Harbour", lat: -30.2963, lon: 153.1135 },
  { suburb: "Port Macquarie", lat: -31.4319, lon: 152.9089 },
  { suburb: "Taree", lat: -31.8997, lon: 152.4597 },
  { suburb: "Tamworth", lat: -31.0917, lon: 150.9270 },
  { suburb: "Dubbo", lat: -32.2569, lon: 148.6010 },
  { suburb: "Orange", lat: -33.2839, lon: 149.1007 },
  { suburb: "Bathurst", lat: -33.4195, lon: 149.5775 },
  { suburb: "Maitland", lat: -32.7324, lon: 151.5563 },
  { suburb: "Tweed Heads", lat: -28.1784, lon: 153.5436 },
  { suburb: "Byron Bay", lat: -28.6474, lon: 153.6120 },
  { suburb: "Nowra", lat: -34.8820, lon: 150.6000 },
  { suburb: "Goulburn", lat: -34.7539, lon: 149.7200 },
  { suburb: "Kempsey", lat: -31.0820, lon: 152.8230 },
  { suburb: "Forster", lat: -32.1833, lon: 152.5235 },
  { suburb: "Armidale", lat: -30.5118, lon: 151.6712 },
  { suburb: "Ulladulla", lat: -35.3570, lon: 150.4700 }
];

const jobTemplates = [
  {
    title: "Fix leaking tap",
    description: "Quick service for a dripping tap, with full flush and cleanup after repair.",
    skills: ["plumbing"],
    tools: ["adjustable wrench", "ptfe tape", "screwdriver set"],
    priceMin: 65,
    priceMax: 130
  },
  {
    title: "Replace light switch",
    description: "Replace a faulty switch safely and test supply before handover.",
    skills: ["electrical"],
    tools: ["screwdriver set", "voltage tester", "wire stripper"],
    priceMin: 110,
    priceMax: 190
  },
  {
    title: "Patch and paint wall",
    description: "Repair small blemish and refresh with matching paint in a short window.",
    skills: ["painting"],
    tools: ["spackle", "sandpaper", "roller", "brush"],
    priceMin: 90,
    priceMax: 170
  },
  {
    title: "Assemble flat-pack furniture",
    description: "Fast assembly and fixing of small wardrobes, shelves or desks.",
    skills: ["handyman", "carpentry"],
    tools: ["drill", "screwdriver set", "spirit level"],
    priceMin: 75,
    priceMax: 180
  },
  {
    title: "Install TV wall bracket",
    description: "Mount secure and test cables with concealed routing where possible.",
    skills: ["handyman", "electrical"],
    tools: ["drill", "stud finder", "screwdriver set"],
    priceMin: 140,
    priceMax: 220
  },
  {
    title: "Trim and tidy garden verge",
    description: "Small hedge or lawn tidy-up with bagging of clippings and washup.",
    skills: ["landscaping"],
    tools: ["hedge trimmer", "gloves", "rake"],
    priceMin: 70,
    priceMax: 140
  },
  {
    title: "Fix door latch",
    description: "Refit and align door latch for smooth opening and secure shut.",
    skills: ["carpentry", "handyman"],
    tools: ["drill", "screwdriver set", "chisel"],
    priceMin: 60,
    priceMax: 125
  },
  {
    title: "Replace smoke alarm",
    description: "Fit battery replacement and verify alarm function.",
    skills: ["handyman", "electrical"],
    tools: ["step ladder", "screwdriver set"],
    priceMin: 55,
    priceMax: 95
  },
  {
    title: "Unblock kitchen sink",
    description: "Clear slow-draining sink using non-chemical method first.",
    skills: ["plumbing"],
    tools: ["plunger", "pipe wrench", "bucket"],
    priceMin: 80,
    priceMax: 150
  },
  {
    title: "Replace outdoor light",
    description: "Replace faulty outdoor light and check waterproof housing integrity.",
    skills: ["electrical"],
    tools: ["wire stripper", "screwdriver set", "voltage tester"],
    priceMin: 120,
    priceMax: 190
  },
  {
    title: "Hang wall frames",
    description: "Secure several picture frames with level and tidy alignment.",
    skills: ["handyman"],
    tools: ["drill", "spirit level", "anchors"],
    priceMin: 50,
    priceMax: 95
  },
  {
    title: "Replace faulty plug socket",
    description: "Replace or test one plug socket and reconnect with load check.",
    skills: ["electrical"],
    tools: ["screwdriver set", "circuit tester", "wire stripper"],
    priceMin: 100,
    priceMax: 170
  }
];

const suffixOptions = [
  "nearby",
  "quick",
  "urgent",
  "same-day",
  "simple fix",
  "fast service"
];

function buildDemoJobs() {
  const rng = createRng(20260302);

  return Array.from({ length: DEMO_JOB_COUNT }, (_, index) => {
    const area = randomChoice(rng, nswAreas);
    const template = randomChoice(rng, jobTemplates);
    const suffix = randomChoice(rng, suffixOptions);
    const duration = randomInt(rng, 10, 45);
    const latJitter = jitter(area.lat, rng, 0.12);
    const lonJitter = jitter(area.lon, rng, 0.16);

    return {
      title: `${template.title} ${suffix} (${duration} mins)`,
      description: template.description,
      skills: template.skills,
      tools: template.tools,
      price: randomPrice(rng, template),
      customerName: `Demo Customer ${String(index + 1).padStart(3, "0")}`,
      address: buildAddress(area),
      location: {
        lat: Number(latJitter.toFixed(6)),
        lon: Number(lonJitter.toFixed(6))
      }
    };
  });
}

const demoJobs = buildDemoJobs();

function buildProgressBar(current, total) {
  const width = 24;
  const clamped = Math.max(0, Math.min(current, total));
  const ratio = total === 0 ? 1 : clamped / total;
  const filled = Math.round(ratio * width);
  return `[${"#".repeat(filled).padEnd(width, ".")}] ${String(clamped).padStart(3, " ")} / ${total}`;
}

async function reopenExistingDemoJobs(client, indexName) {
  const updateByQuery = (client.updateByQuery || client.update_by_query)?.bind(client);
  if (typeof updateByQuery !== "function") {
    throw new Error("Elasticsearch client does not support update-by-query.");
  }

  const response = await updateByQuery({
    index: indexName,
    conflicts: "proceed",
    refresh: true,
    script: {
      source:
        "ctx._source.status = 'open'; " +
        "ctx._source.acceptedAt = null; " +
        "ctx._source.acceptedBy = null;"
    },
    query: {
      term: { seed: SEED_NAME }
    }
  });

  const updated = response.updated ?? response.body?.updated ?? 0;
  if (updated > 0) console.log(`Reopened ${updated} existing demo jobs.`);
}

async function main() {
  const client = createElasticsearchClientFromEnv();
  if (!client) {
    console.error("Elasticsearch is not configured. Set ELASTICSEARCH_CLOUD_ID or ELASTICSEARCH_NODE.");
    process.exitCode = 1;
    return;
  }

  const jobsIndex = (process.env.ES_JOBS_INDEX || "omj-jobs").trim() || "omj-jobs";
  await ensureJobsIndex(client, jobsIndex);
  await reopenExistingDemoJobs(client, jobsIndex);

  const total = demoJobs.length;
  console.log(`Seeding ${total} demo jobs into '${jobsIndex}'...`);
  console.log(buildProgressBar(0, total));

  const batchSize = 80;
  let upserted = 0;

  for (let start = 0; start < total; start += batchSize) {
    const batch = demoJobs.slice(start, start + batchSize);
    const body = [];

    for (const job of batch) {
      const id = stableId([SEED_NAME, job.title, job.address, `${job.location.lat}`, `${job.location.lon}`]);
      const document = makeJobDocument(job);

      body.push({ index: { _index: jobsIndex, _id: id } });
      body.push(document);
    }

    const bulkResponse = await client.bulk({ body });
    if (bulkResponse.errors) {
      const items = bulkResponse.items ?? [];
      const firstError = items.find((item) => item?.index?.error)?.index;
      if (firstError) {
        throw new Error(`Bulk indexing failed: ${firstError.error?.type} ${firstError.error?.reason}`);
      }
    }

    upserted += batch.length;
    console.log(`\r${buildProgressBar(upserted, total)}`);
  }

  await client.indices.refresh({ index: jobsIndex });
  console.log(`\nSeeded ${upserted} demo jobs into '${jobsIndex}'.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
