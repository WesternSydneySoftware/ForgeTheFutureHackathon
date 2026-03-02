const DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org";

const geocodeCache = new Map();

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

function getBaseUrlFromEnv() {
  return toNonEmptyString(process.env.GEOCODER_BASE_URL) ?? DEFAULT_BASE_URL;
}

function getUserAgentFromEnv() {
  return (
    toNonEmptyString(process.env.GEOCODER_USER_AGENT) ??
    "EnRouteHackathon/0.1 (contact: https://github.com/Matthodical/ForgeTheFutureHackathon)"
  );
}

async function geocodeAddressUncached(address) {
  const normalized = toNonEmptyString(address);
  if (!normalized) throw new Error("address is required");

  const baseUrl = getBaseUrlFromEnv();
  const url = new URL("/search", baseUrl);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", normalized);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": getUserAgentFromEnv()
    }
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const extra = bodyText && bodyText.trim() ? `: ${bodyText.trim()}` : "";
    throw new Error(`Geocoding failed (${response.status})${extra}`);
  }

  const results = await response.json().catch(() => null);
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Could not find that address. Try adding suburb/city/state.");
  }

  const first = results[0] ?? null;
  const lat = toNumber(first?.lat);
  const lon = toNumber(first?.lon);
  if (lat === null || lon === null) throw new Error("Geocoding returned an invalid coordinate");

  return {
    lat,
    lon,
    label: toNonEmptyString(first?.display_name) ?? normalized,
    provider: "nominatim"
  };
}

async function geocodeAddress(address) {
  const key = String(address ?? "").trim().toLowerCase();
  if (!key) throw new Error("address is required");

  if (geocodeCache.has(key)) return await geocodeCache.get(key);

  const promise = geocodeAddressUncached(address).catch((error) => {
    geocodeCache.delete(key);
    throw error;
  });
  geocodeCache.set(key, promise);
  return await promise;
}

module.exports = { geocodeAddress };
