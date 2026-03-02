const DEFAULT_ROUTER_BASE_URL = "https://router.project-osrm.org";

function toNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function getRouterBaseUrlFromEnv() {
  return toNonEmptyString(process.env.ROUTER_BASE_URL) ?? DEFAULT_ROUTER_BASE_URL;
}

async function fetchJsonWithTimeout(url, { timeoutMs = 8000, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: controller.signal
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const extra = bodyText && bodyText.trim() ? `: ${bodyText.trim()}` : "";
      throw new Error(`Routing failed (${response.status})${extra}`);
    }

    const body = await response.json().catch(() => null);
    if (!body) throw new Error("Routing returned an invalid response");
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function getDrivingRoute({ start, end }) {
  if (!start || typeof start.lat !== "number" || typeof start.lon !== "number") {
    throw new Error("start lat/lon are required");
  }
  if (!end || typeof end.lat !== "number" || typeof end.lon !== "number") {
    throw new Error("end lat/lon are required");
  }

  const baseUrl = getRouterBaseUrlFromEnv();
  const url = new URL(
    `/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}`,
    baseUrl
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const body = await fetchJsonWithTimeout(url);
  const route = Array.isArray(body?.routes) ? body.routes[0] : null;
  const geometry = route?.geometry ?? null;

  if (!route) throw new Error("No route found");
  if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    throw new Error("Routing did not return a line geometry");
  }

  return {
    distanceM: typeof route.distance === "number" ? route.distance : null,
    durationS: typeof route.duration === "number" ? route.duration : null,
    geometry
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

function sampleRoutePointsFromLineString(lineString, { stepMeters = 1000, maxPoints = 80 } = {}) {
  const coords = Array.isArray(lineString?.coordinates) ? lineString.coordinates : [];
  if (coords.length === 0) return [];

  const points = [];
  const first = coords[0];
  points.push({ lat: first[1], lon: first[0] });

  let lastKept = { lat: first[1], lon: first[0] };
  let kept = 1;

  for (let i = 1; i < coords.length - 1; i += 1) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    const candidate = { lat: c[1], lon: c[0] };
    const d = haversineDistanceMeters(lastKept, candidate);
    if (d < stepMeters) continue;
    points.push(candidate);
    lastKept = candidate;
    kept += 1;
    if (kept >= maxPoints - 1) break;
  }

  const last = coords[coords.length - 1];
  points.push({ lat: last[1], lon: last[0] });
  return points;
}

module.exports = { getDrivingRoute, sampleRoutePointsFromLineString, haversineDistanceMeters };

