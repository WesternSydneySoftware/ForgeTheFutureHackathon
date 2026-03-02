function createEl(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function setLocationStatus(statusEl, message) {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function formatKm(value) {
  if (value === null || value === undefined) return "";
  const num = typeof value === "number" ? value : toNumber(value);
  if (num === null) return "";
  return `${num.toFixed(2)} km`;
}

function formatMinutes(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  const mins = Math.max(0, Math.round(seconds / 60));
  return `${mins} min`;
}

function haversineDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toNumber(a?.lat);
  const lon1 = toNumber(a?.lng ?? a?.lon);
  const lat2 = toNumber(b?.lat);
  const lon2 = toRad;
  if ([lat1, lon1, lat2, toNumber(b?.lng ?? b?.lon)].some((value) => value === null)) return null;
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(toNumber(b?.lat));
  const deltaLat = toRad(toNumber(b?.lat) - lat1);
  const deltaLon = toRad((toNumber(b?.lng ?? b?.lon) - lon1));
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(radLat1) * Math.cos(radLat2) * sinLon * sinLon;
  return 2 * 6371e3 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const DEFAULT_NEARBY_RADIUS = "5km";

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showResultsStage(searchPanel, resultsStage, editSearchBtn) {
  if (searchPanel) searchPanel.classList.add("is-collapsed");
  if (resultsStage) resultsStage.classList.add("is-visible");
  if (editSearchBtn) editSearchBtn.hidden = false;
  setFormProgressStep(3);
}

function setFormProgressStep(step = 1) {
  const progress = document.getElementById("formProgress");
  const steps = progress?.querySelectorAll(".progress-step") ?? [];
  for (const item of steps) {
    const value = Number(item?.dataset?.step);
    item.classList.toggle("is-active", value === step);
  }
}

function setFormStep(formStep, tradieStepEl, locationStepEl) {
  const step = Number(formStep) || 1;
  if (tradieStepEl) {
    const isActive = step === 1;
    tradieStepEl.classList.toggle("is-hidden", !isActive);
    tradieStepEl.setAttribute("aria-hidden", String(!isActive));
    if ("inert" in HTMLDivElement.prototype) {
      tradieStepEl.toggleAttribute("inert", !isActive);
    }
  }

  if (locationStepEl) {
    const isActive = step === 2;
    locationStepEl.classList.toggle("is-hidden", !isActive);
    locationStepEl.setAttribute("aria-hidden", String(!isActive));
    if ("inert" in HTMLDivElement.prototype) {
      locationStepEl.toggleAttribute("inert", !isActive);
    }
  }

  setFormProgressStep(step);
}

function showSearchPanel(searchPanel, resultsStage, editSearchBtn, resultsEl, banner) {
  if (searchPanel) searchPanel.classList.remove("is-collapsed");
  if (resultsStage) resultsStage.classList.remove("is-visible");
  if (editSearchBtn) editSearchBtn.hidden = true;
  if (resultsEl) resultsEl.innerHTML = "";
  if (banner) window.EnRoute.showBanner(banner, "", "");
}

function getDetourMinutes(job, avgSpeedKph) {
  const explicit = toNumber(job?.routeDetourMinutes);
  if (explicit !== null) return explicit;

  const distanceKm = toNumber(job?.routeDistanceKm);
  const speed = toNumber(avgSpeedKph);
  if (distanceKm === null || speed === null || speed <= 0) return null;

  const minutes = (distanceKm / speed) * 60;
  return Number.isFinite(minutes) ? minutes : null;
}

function getDetourColor(minutes) {
  const detourMinutes = toNumber(minutes);
  if (detourMinutes === null) return null;
  if (detourMinutes < 10) return "#4c1d95";
  if (detourMinutes < 20) return "#9a3412";
  return "#9d174d";
}

function buildJobMarkerIcon(maps, color) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 8.4,
    fillColor: color,
    fillOpacity: 0.98,
    strokeColor: "#ffffff",
    strokeOpacity: 0.95,
    strokeWeight: 2
  };
}

function renderNoJobs(resultsEl) {
  resultsEl.innerHTML = "";
  const card = createEl("article", "card");
  const inner = createEl("div", "card-inner");
  const title = createEl("h3");
  title.textContent = "No jobs found";
  const p = createEl("p");
  p.textContent = "Try changing location, removing skill filters, or widening your search.";
  inner.append(title, p);
  card.append(inner);
  resultsEl.append(card);
}

function renderJobs(resultsEl, jobs) {
  resultsEl.innerHTML = "";

  for (const job of jobs) {
    const card = createEl("article", "card");
    const inner = createEl("div", "card-inner");

    const h3 = createEl("h3");
    h3.textContent = job.title ?? "Untitled job";

    const p = createEl("p");
    p.textContent = job.description?.trim() ? job.description : "No description provided.";

    const pills = createEl("div", "pill-row");
    const skills = Array.isArray(job.skills) ? job.skills : [];
    for (const s of skills.slice(0, 6)) {
      const pill = createEl("span", "pill");
      pill.textContent = s;
      pills.append(pill);
    }

    const routeDetourMinutes = toNumber(job.routeDetourMinutes);
    if (routeDetourMinutes !== null) {
      const pill = createEl("span", "pill");
      pill.textContent = `Detour approx. ${Math.round(routeDetourMinutes)} min`;
      pills.append(pill);
    } else if (typeof job.routeDistanceKm === "number" && Number.isFinite(job.routeDistanceKm)) {
      const pill = createEl("span", "pill");
      pill.textContent = `≈ ${formatKm(job.routeDistanceKm)} from route`;
      pills.append(pill);
    } else if (job.distanceKm !== null && job.distanceKm !== undefined) {
      const pill = createEl("span", "pill");
      pill.textContent = `${formatKm(job.distanceKm)} away`;
      pills.append(pill);
    }

    if (job.price !== null && job.price !== undefined) {
      const pill = createEl("span", "pill");
      pill.textContent = `$${job.price}`;
      pills.append(pill);
    }

    const actions = createEl("div", "actions");
    const view = createEl("a", "btn");
    view.href = `/jobs/${job.id}`;
    view.textContent = "View";

    const accept = createEl("button", "btn cta");
    accept.type = "button";
    accept.dataset.jobId = job.id;
    accept.textContent = "Accept";

    actions.append(view, accept);
    inner.append(h3, p, pills, actions);
    card.append(inner);
    resultsEl.append(card);
  }
}

let googleMapsLoadPromise = null;

function loadGoogleMapsScript(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) return resolve(window.google.maps);
      return reject(new Error("Google Maps loaded but was unavailable."));
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

async function initMap(banner) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return null;

  let config = null;
  try {
    config = await window.EnRoute.requestJson("/api/config");
  } catch {
    config = null;
  }

  const apiKey = typeof config?.googleMapsApiKey === "string" ? config.googleMapsApiKey.trim() : "";
  if (!apiKey) {
    window.EnRoute.showBanner(banner, "Google Maps is not configured. Set GOOGLE_MAPS_API_KEY.", "error");
    return null;
  }

  let maps = null;
  try {
    maps = await loadGoogleMapsScript(apiKey);
  } catch (error) {
    window.EnRoute.showBanner(banner, error instanceof Error ? error.message : String(error), "error");
    return null;
  }

  const map = new maps.Map(mapEl, {
    center: { lat: -33.8688, lng: 151.2093 },
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });

  const infoWindow = new maps.InfoWindow();
  const jobMarkers = [];

  let tradieMarker = null;
  let destinationMarker = null;
  let destinationLabel = "";
  let routeLine = null;

  function clearRoute() {
    if (routeLine) routeLine.setMap(null);
    routeLine = null;
    if (destinationMarker) destinationMarker.setMap(null);
    destinationMarker = null;
    destinationLabel = "";
  }

  function clearJobs() {
    for (const m of jobMarkers) m.setMap(null);
    jobMarkers.length = 0;
  }

  function setTradieLocation({ lat, lon }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const position = { lat, lng: lon };
    if (tradieMarker) tradieMarker.setPosition(position);
    else tradieMarker = new maps.Marker({ map, position, title: "You" });
  }

  function clearTradieLocation() {
    if (tradieMarker) tradieMarker.setMap(null);
    tradieMarker = null;
  }

  function setDestination({ lat, lon, label }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const position = { lat, lng: lon };
    destinationLabel = label ? String(label) : "";

    if (destinationMarker) destinationMarker.setPosition(position);
    else {
      destinationMarker = new maps.Marker({ map, position, title: "Destination" });
      destinationMarker.addListener("click", () => {
        if (!destinationLabel) return;
        infoWindow.setContent(`<strong>Destination</strong><br/>${escapeHtml(destinationLabel)}`);
        infoWindow.open({ map, anchor: destinationMarker });
      });
    }
  }

  function setRouteGeometry(geometry) {
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return;
    if (routeLine) routeLine.setMap(null);

    const path = geometry.coordinates
      .map((c) => {
        if (!Array.isArray(c) || c.length < 2) return null;
        const lon = toNumber(c[0]);
        const lat = toNumber(c[1]);
        if (lat === null || lon === null) return null;
        return { lat, lng: lon };
      })
      .filter(Boolean);

    routeLine = new maps.Polyline({
      map,
      path,
      strokeColor: "#1e88e5",
      strokeOpacity: 0.9,
      strokeWeight: 4
    });
  }

  function setJobs(jobs, mapSettings = {}) {
    const { routeAvgSpeedKph = null, useDetourColor = false } = mapSettings;
    clearJobs();
    const list = Array.isArray(jobs) ? jobs : [];

    for (const job of list) {
      const loc = job?.location ?? null;
      const lat = toNumber(loc?.lat);
      const lon = toNumber(loc?.lon);
      if (lat === null || lon === null) continue;

      const detourMinutes = useDetourColor ? getDetourMinutes(job, routeAvgSpeedKph) : null;
      const detourColor = getDetourColor(detourMinutes);

      const markerOpts = {
        map,
        position: { lat, lng: lon },
        title: job?.title ? String(job.title) : "Job"
      };

      if (detourColor) {
        markerOpts.icon = buildJobMarkerIcon(maps, detourColor);
      }

      const marker = new maps.Marker(markerOpts);

      const detourLabel =
        detourMinutes === null
          ? ""
          : `<br/>Detour: ${Math.max(0, Math.round(detourMinutes))} min`;

      marker.addListener("click", () => {
        const safeTitle = job?.title ? escapeHtml(job.title) : "Job";
        infoWindow.setContent(
          `<strong>${safeTitle}</strong>${detourLabel}<br/><a href="/jobs/${encodeURIComponent(job.id)}">View</a>`
        );
        infoWindow.open({ map, anchor: marker });
      });

      jobMarkers.push(marker);
    }
  }

  function fitToContents() {
    const bounds = new maps.LatLngBounds();
    let hasAny = false;

    if (routeLine) {
      const path = routeLine.getPath();
      for (let i = 0; i < path.getLength(); i += 1) {
        bounds.extend(path.getAt(i));
        hasAny = true;
      }
    }

    for (const m of jobMarkers) {
      const pos = m.getPosition();
      if (!pos) continue;
      bounds.extend(pos);
      hasAny = true;
    }

    if (tradieMarker) {
      const pos = tradieMarker.getPosition();
      if (pos) {
        bounds.extend(pos);
        hasAny = true;
      }
    }

    if (destinationMarker) {
      const pos = destinationMarker.getPosition();
      if (pos) {
        bounds.extend(pos);
        hasAny = true;
      }
    }

    if (hasAny) map.fitBounds(bounds, 70);
  }

  return {
    map,
    setTradieLocation,
    clearTradieLocation,
    setDestination,
    clearRoute,
    setRouteGeometry,
    setJobs,
    fitToContents,
    refresh() {
      if (!maps?.event) return;
      maps.event.trigger(map, "resize");
    }
  };
}

async function runNearbySearch({ banner, resultsEl, mapStatePromise, q }) {
  window.EnRoute.showBanner(banner, "", "");

  const params = new URLSearchParams({
    address: q.start,
    radius: q.radius || DEFAULT_NEARBY_RADIUS,
    skills: q.skills || ""
  });

  const results = await window.EnRoute.requestJson(`/api/jobs/nearby?${params.toString()}`);
  if (!results || !Array.isArray(results.jobs)) throw new Error("Unexpected response from server");

  const mapState = mapStatePromise ? await mapStatePromise.catch(() => null) : null;
  if (mapState) {
    mapState.clearRoute();
    if (results.origin && typeof results.origin.lat === "number" && typeof results.origin.lon === "number") {
      mapState.setTradieLocation({ lat: results.origin.lat, lon: results.origin.lon });
    } else {
      mapState.clearTradieLocation();
    }
    mapState.setJobs(results.jobs, { useDetourColor: false });
    mapState.refresh();
    mapState.fitToContents();
    setTimeout(() => {
      mapState.refresh();
      mapState.fitToContents();
    }, 450);
  }

  if (results.jobs.length === 0) return renderNoJobs(resultsEl);
  return renderJobs(resultsEl, results.jobs);
}

async function runRouteSearch({ banner, resultsEl, mapStatePromise, q }) {
  window.EnRoute.showBanner(banner, "", "");

  const destination = String(q.destination || "").trim();
  if (!destination) throw new Error("Destination is required for route search.");

  const params = new URLSearchParams({
    start: q.start,
    destination,
    detourMinutes: q.detourMinutes || "5",
    skills: q.skills || ""
  });

  const results = await window.EnRoute.requestJson(`/api/jobs/route?${params.toString()}`);
  if (!results || !Array.isArray(results.jobs) || !results.route || !results.route.geometry) {
    throw new Error("Unexpected response from server");
  }

  const routeSummary = [
    typeof results.route.distanceM === "number" ? `${formatKm(results.route.distanceM / 1000)} route` : "",
    typeof results.route.durationS === "number" ? `${formatMinutes(results.route.durationS)} drive` : "",
    typeof results.bufferDistance === "string" ? `buffer ${results.bufferDistance}` : ""
  ]
    .filter(Boolean)
    .join(" · ");

  if (routeSummary) window.EnRoute.showBanner(banner, routeSummary, "");

  const mapState = mapStatePromise ? await mapStatePromise.catch(() => null) : null;
    if (mapState) {
      if (results.start && typeof results.start.lat === "number" && typeof results.start.lon === "number") {
        mapState.setTradieLocation({ lat: results.start.lat, lon: results.start.lon });
      } else {
        mapState.clearTradieLocation();
      }
    if (results.end && typeof results.end.lat === "number" && typeof results.end.lon === "number") {
      mapState.setDestination({ lat: results.end.lat, lon: results.end.lon, label: results.end.label ?? destination });
    }
    mapState.setRouteGeometry(results.route.geometry);
    mapState.setJobs(results.jobs, {
      useDetourColor: true,
      routeAvgSpeedKph: results.routeAvgSpeedKph ?? 40
    });
    mapState.refresh();
    mapState.fitToContents();
    setTimeout(() => {
      mapState.refresh();
      mapState.fitToContents();
    }, 450);
  }

  if (results.jobs.length === 0) return renderNoJobs(resultsEl);
  return renderJobs(resultsEl, results.jobs);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("searchForm");
  const resultsEl = document.getElementById("results");
  const banner = document.getElementById("banner");
  const useMyLocationBtn = document.getElementById("useMyLocationBtn");
  const clearLocationBtn = document.getElementById("clearLocationBtn");
  const locationStatus = document.getElementById("locationStatus");
  const startInput = document.getElementById("start");
  const destinationInput = document.getElementById("destination");
  const detourMinutesInput = document.getElementById("detourMinutes");
  const searchPanel = document.getElementById("searchPanel");
  const resultsStage = document.getElementById("resultsStage");
  const editSearchBtn = document.getElementById("editSearchBtn");
  const tradieStep = document.getElementById("tradieStep");
  const locationStep = document.getElementById("locationStep");
  const continueToLocationBtn = document.getElementById("continueToLocationBtn");
  const backToTradieBtn = document.getElementById("backToTradieBtn");

  if (!form || !resultsEl) return;
  setFormStep(1, tradieStep, locationStep);

  const mapStatePromise = initMap(banner).catch(() => null);
  let lastSearch = null;

  function clearLocation() {
    if (startInput instanceof HTMLInputElement) startInput.value = "";
    setLocationStatus(locationStatus, "Enter an address/suburb, or use your device location.");
    mapStatePromise.then((mapState) => mapState?.clearTradieLocation()).catch(() => null);
  }

  async function reverseGeocodeWithGoogle({ lat, lon }) {
    const config = await window.EnRoute.requestJson("/api/config");
    const apiKey = typeof config?.googleMapsApiKey === "string" ? config.googleMapsApiKey.trim() : "";
    if (!apiKey) throw new Error("Google Maps is not configured. Set GOOGLE_MAPS_API_KEY.");

    const maps = await loadGoogleMapsScript(apiKey);
    const geocoder = new maps.Geocoder();

    return await new Promise((resolve, reject) => {
      geocoder.geocode({ location: { lat, lng: lon } }, (results, status) => {
        if (status !== "OK" || !Array.isArray(results) || results.length === 0) {
          return reject(new Error("Could not find an address for your location."));
        }
        const first = results[0] ?? null;
        const label =
          first && typeof first.formatted_address === "string" && first.formatted_address.trim()
            ? first.formatted_address.trim()
            : null;
        if (!label) return reject(new Error("Could not find an address for your location."));
        return resolve(label);
      });
    });
  }

  if (useMyLocationBtn) {
    useMyLocationBtn.addEventListener("click", async () => {
      if (!("geolocation" in navigator)) {
        return window.EnRoute.showBanner(banner, "Geolocation is not supported in this browser.", "error");
      }

      if (!(startInput instanceof HTMLInputElement)) return;

      useMyLocationBtn.setAttribute("disabled", "disabled");
      window.EnRoute.showBanner(banner, "", "");
      setLocationStatus(locationStatus, "Requesting location permission…");

      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 30000
          })
        );

        const latitude = pos?.coords?.latitude;
        const longitude = pos?.coords?.longitude;
        const accuracyM = pos?.coords?.accuracy;

        if (typeof latitude !== "number" || typeof longitude !== "number") throw new Error("Could not get your location.");

        setLocationStatus(locationStatus, "Looking up address…");
        const address = await reverseGeocodeWithGoogle({ lat: latitude, lon: longitude });
        startInput.value = address;

        const accuracyText =
          typeof accuracyM === "number" && Number.isFinite(accuracyM) ? ` (±${Math.round(accuracyM)}m)` : "";
        setLocationStatus(locationStatus, `Using device location${accuracyText}: ${address}`);
      } catch (error) {
        setLocationStatus(locationStatus, "Enter an address/suburb, or try again.");
        window.EnRoute.showBanner(
          banner,
          error instanceof Error ? error.message : "Could not get your location.",
          "error"
        );
      } finally {
        useMyLocationBtn.removeAttribute("disabled");
      }
    });
  }

  if (clearLocationBtn) clearLocationBtn.addEventListener("click", clearLocation);
  if (editSearchBtn) {
    editSearchBtn.addEventListener("click", () => {
      showSearchPanel(searchPanel, resultsStage, editSearchBtn, resultsEl, banner);
      setFormStep(1, tradieStep, locationStep);
      clearLocation();
    });
  }

  if (continueToLocationBtn) {
    continueToLocationBtn.addEventListener("click", () => {
      if (!String(form.tradieName.value || "").trim()) {
        window.EnRoute.showBanner(banner, "Enter your tradie name before continuing.", "error");
        return;
      }
      setFormStep(2, tradieStep, locationStep);
      if (banner) window.EnRoute.showBanner(banner, "", "");
    });
  }

  if (backToTradieBtn) {
    backToTradieBtn.addEventListener("click", () => setFormStep(1, tradieStep, locationStep));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
    const mode =
      submitter && typeof submitter.dataset?.submitMode === "string" ? submitter.dataset.submitMode : "nearby";

    const q = {
      tradieName: String(form.tradieName.value || "").trim(),
      start: startInput instanceof HTMLInputElement ? startInput.value : "",
      skills: String(form.skills.value || "").trim(),
      destination: destinationInput instanceof HTMLInputElement ? destinationInput.value : "",
      detourMinutes: detourMinutesInput instanceof HTMLInputElement ? detourMinutesInput.value : ""
    };

    if (!String(q.start || "").trim()) {
      return window.EnRoute.showBanner(
        banner,
        "Enter your location address first (or use your device location).",
        "error"
      );
    }

    showResultsStage(searchPanel, resultsStage, editSearchBtn);

    const submitButtons = Array.from(form.querySelectorAll('button[type="submit"]'));
    for (const b of submitButtons) b.disabled = true;

    try {
      lastSearch = { mode, q };
      if (mode === "route") await runRouteSearch({ banner, resultsEl, mapStatePromise, q });
      else await runNearbySearch({ banner, resultsEl, mapStatePromise, q });
    } catch (error) {
      window.EnRoute.showBanner(
        banner,
        error instanceof Error ? error.message : String(error),
        "error"
      );
      resultsEl.innerHTML = "";
    } finally {
      for (const b of submitButtons) b.disabled = false;
    }
  });

  resultsEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName !== "BUTTON") return;
    if (!target.dataset.jobId) return;

    const jobId = target.dataset.jobId;
    const tradieName = String(form.tradieName.value || "").trim();
    if (!tradieName) return window.EnRoute.showBanner(banner, "Enter your name first.", "error");

    target.setAttribute("disabled", "disabled");
    window.EnRoute.showBanner(banner, "", "");

    try {
      await window.EnRoute.requestJson(`/api/jobs/${encodeURIComponent(jobId)}/accept`, {
        method: "POST",
        body: JSON.stringify({ tradieName })
      });

      window.EnRoute.showBanner(banner, "Accepted job.", "");

      if (lastSearch) {
        const { mode, q } = lastSearch;
        if (mode === "route") await runRouteSearch({ banner, resultsEl, mapStatePromise, q });
        else await runNearbySearch({ banner, resultsEl, mapStatePromise, q });
      }
    } catch (error) {
      window.EnRoute.showBanner(
        banner,
        error instanceof Error ? error.message : String(error),
        "error"
      );
    } finally {
      target.removeAttribute("disabled");
    }
  });
});
