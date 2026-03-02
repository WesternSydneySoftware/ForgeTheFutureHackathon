async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (options.body !== undefined && !headers.has("content-type"))
    headers.set("content-type", "application/json");

  const response = await fetch(url, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : typeof body === "string" && body.trim()
          ? body
          : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

function showBanner(bannerEl, message, variant = "") {
  if (!bannerEl) return;
  if (!message) {
    bannerEl.hidden = true;
    bannerEl.textContent = "";
    bannerEl.classList.remove("error");
    return;
  }

  bannerEl.hidden = false;
  bannerEl.textContent = message;
  bannerEl.classList.toggle("error", variant === "error");
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function parseJobIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "jobs") return parts[1];
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  return fromQuery || "";
}

window.EnRoute = { requestJson, showBanner, formatDateTime, parseJobIdFromPath };
window.OMJ = window.EnRoute;
