let BedrockRuntimeClient = null;
let InvokeModelCommand = null;

try {
  ({ BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime"));
} catch {}

const DEFAULT_BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
const DEFAULT_MAX_TOKENS = 700;
const DEFAULT_TEMPERATURE = 0.1;
const BEDROCK_TIMEOUT_MS = 8000;

function toText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toTextArray(value) {
  if (!Array.isArray(value)) return [];
  const values = [];
  for (const item of value) {
    const text = toText(item);
    if (!text) continue;
    values.push(text.toLowerCase());
  }
  return values;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const item of values) {
    const normalised = String(item).trim().toLowerCase();
    if (!normalised) continue;
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    result.push(normalised);
  }
  return result;
}

function safeParseJson(text) {
  const normalized = toText(text);
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function extractJsonFromText(text) {
  const direct = toText(text);
  if (!direct) return null;

  const codeBlock = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = toText(codeBlock?.[1] ?? direct);
  if (!candidate) return null;

  const parsed = safeParseJson(candidate);
  if (parsed) return parsed;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  return safeParseJson(candidate.slice(firstBrace, lastBrace + 1));
}

function extractTextFromBedrockPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  if (typeof payload.message?.content?.text === "string") return payload.message.content.text;
  if (typeof payload.content === "string") return payload.content;
  if (Array.isArray(payload.content)) {
    const textBlock = payload.content.find(
      (entry) => typeof entry === "object" && typeof entry.text === "string" && entry.text.trim()
    );
    if (textBlock?.text) return textBlock.text;
  }

  if (typeof payload.outputText === "string") return payload.outputText;
  if (typeof payload.completion === "string") return payload.completion;
  if (typeof payload.answer === "string") return payload.answer;
  if (typeof payload.text === "string") return payload.text;

  if (Array.isArray(payload.results) && payload.results.length > 0) {
    const firstResult = payload.results[0];
    if (typeof firstResult.outputText === "string") return firstResult.outputText;
    if (typeof firstResult.generated_text === "string") return firstResult.generated_text;
    if (Array.isArray(firstResult.output) && firstResult.output.length > 0) {
      const firstOutput = firstResult.output[0];
      if (typeof firstOutput?.text === "string") return firstOutput.text;
    }
  }

  if (Array.isArray(payload.contentBlocks) && payload.contentBlocks.length > 0) {
    const firstBlock = payload.contentBlocks.find(
      (entry) => typeof entry?.text === "string" && entry.text.trim()
    );
    if (firstBlock?.text) return firstBlock.text;
  }

  return null;
}

function isStructuredCandidate(value) {
  if (!value || typeof value !== "object") return false;
  const title = toText(value.title);
  const description = toText(value.description);
  const hasSkills = Array.isArray(value.skills);
  const hasTools = Array.isArray(value.tools);
  return Boolean(title || description || hasSkills || hasTools);
}

function parseBedrockResponse(rawBodyText) {
  const parsed = safeParseJson(rawBodyText);
  if (!parsed) return null;

  if (isStructuredCandidate(parsed)) return parsed;

  const innerPayload =
    parsed.body ??
    parsed.output ??
    parsed.content ??
    parsed.response ??
    parsed.results?.[0] ??
    parsed.message ??
    null;

  if (isStructuredCandidate(innerPayload)) return innerPayload;

  const responseText = extractTextFromBedrockPayload(parsed) ?? extractTextFromBedrockPayload(innerPayload);
  if (!responseText) return null;

  return extractJsonFromText(responseText);
}

function extractFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  const title = toText(payload.title);
  const description = toText(payload.description);
  const skills = uniqueStrings(toTextArray(payload.skills));
  const tools = uniqueStrings(toTextArray(payload.tools));

  return {
    title: title || null,
    description: description || null,
    skills: skills.length > 0 ? skills : [],
    tools: tools.length > 0 ? tools : []
  };
}

function decodeResponseBody(body) {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (typeof body === "object" && typeof body.transformToString === "function")
    return body.transformToString("utf8");
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) return body.toString("utf8");
  return "";
}

function fallbackStructuredJob(issueText) {
  const text = toText(issueText) ?? "";
  const lowerText = text.toLowerCase();
  const title = text.split(".")[0].trim().slice(0, 68);

  const matchedSkills = [];
  for (const [skill, words] of Object.entries(SKILL_HINTS)) {
    if (words.some((term) => new RegExp(`\\b${term}\\b`, "i").test(lowerText))) matchedSkills.push(skill);
  }

  const matchedTools = [];
  for (const [tool, words] of Object.entries(TOOL_HINTS)) {
    if (words.some((term) => new RegExp(`\\b${term}\\b`, "i").test(lowerText))) matchedTools.push(tool);
  }

  return {
    title: title || "Micro-job request",
    description: text.trim() || "Small maintenance or repair job.",
    skills: uniqueStrings(matchedSkills.length > 0 ? matchedSkills : ["handyman"]),
    tools: uniqueStrings(matchedTools)
  };
}

function normaliseResult(rawStructured, issueText) {
  const parsed = extractFromPayload(rawStructured);
  const fallback = fallbackStructuredJob(issueText);
  return {
    title: parsed?.title || fallback.title,
    description: parsed?.description || fallback.description,
    skills: parsed?.skills?.length ? parsed.skills : fallback.skills,
    tools: parsed?.tools?.length ? parsed.tools : fallback.tools
  };
}

function getModelId() {
  const envModel = toText(process.env.BEDROCK_MODEL_ID);
  return envModel || DEFAULT_BEDROCK_MODEL_ID;
}

function buildPrompt(issueText) {
  return `You are an extraction assistant for a tradie jobs board.\nReturn only strict JSON with no markdown.\nUse short values and keywords suitable for search.\nSchema:\n{\n  "title": "Short job title (<=70 chars)",\n  "description": "Concise summary of the issue",\n  "skills": ["plumbing","electrical","handyman", ...],\n  "tools": ["pipe wrench","screwdriver set", ...]\n}\nCustomer issue:\n${issueText}`;
}

let clientInstance = null;

function getClient() {
  if (!BedrockRuntimeClient) return null;
  if (clientInstance) return clientInstance;
  const region = toText(process.env.AWS_REGION) || "ap-southeast-2";
  clientInstance = new BedrockRuntimeClient({ region, maxAttempts: 2 });
  return clientInstance;
}

async function enrichJobWithBedrock(issueText) {
  const modelId = getModelId();
  const client = getClient();
  if (!client) return null;

  const prompt = buildPrompt(issueText);
  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
      system: "Extract concise job fields in strict JSON.",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
    })
  });

  const response = await Promise.race([
    client.send(command),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Bedrock request timed out")), BEDROCK_TIMEOUT_MS)
    )
  ]);

  const bodyText = decodeResponseBody(response?.body);
  const parsed = parseBedrockResponse(bodyText);
  return normaliseResult(parsed, issueText);
}

async function structureJobFromIssue(issueText) {
  const trimmed = toText(issueText);
  if (!trimmed) return fallbackStructuredJob("");
  const fallback = fallbackStructuredJob(trimmed);

  try {
    const structured = await enrichJobWithBedrock(trimmed);
    return structured || fallback;
  } catch {
    return fallback;
  }
}

const SKILL_HINTS = {
  plumbing: ["plumbing", "plumber", "pipe", "tap", "sink", "toilet", "drain", "faucet", "leak", "water", "hose", "valve"],
  electrical: [
    "electrical",
    "electricals",
    "switch",
    "socket",
    "plug",
    "outlet",
    "light",
    "wire",
    "circuit",
    "breaker",
    "fuse",
    "power"
  ],
  painting: ["paint", "painting", "wall", "roller", "brush", "primer", "wallpaper"],
  handyman: ["fix", "repair", "install", "replace", "assemble", "mount", "handyman", "fixing", "repairing"],
  carpentry: ["carpentry", "carpenter", "door", "frame", "shelf", "cabinet", "board", "cabinetry", "skirting"],
  landscaping: ["garden", "lawn", "grass", "hedge", "pathway", "shed", "tree", "bush"]
};

const TOOL_HINTS = {
  wrench: ["wrench", "spanner", "pipe wrench", "adjustable wrench"],
  screwdriver: ["screwdriver", "screwdrivers", "philips", "flathead", "screwdriver set"],
  drill: ["drill", "drill bit", "impact"],
  saw: ["saw", "circular saw", "hand saw"],
  pliers: ["pliers", "needle nose", "grip"],
  tape: ["ptfe", "tape", "thread", "teflon", "duct tape", "electrical tape"],
  paint: ["paint roller", "brush", "sandpaper", "spackle"]
};

module.exports = { structureJobFromIssue };
