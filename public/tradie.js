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
  const lon2 = toNumber(b?.lng ?? b?.lon);

  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;

  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(radLat1) * Math.cos(radLat2) * sinLon * sinLon;
  return 2 * 6371e3 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const DEFAULT_NEARBY_RADIUS = "5km";
const JOURNEY_DEBUG_CONFIG = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const debugRaw = params.get("debug") || params.get("debugJourney") || "";
    const debugEnabled = ["journey", "journey:1", "journey:on", "true", "1"].includes(debugRaw.toLowerCase());

    const localStorageValue = (() => {
      try {
        return window.localStorage.getItem("omj-debug-journey");
      } catch {
        return null;
      }
    })();

    const localEnabled =
      ["1", "true", "on", "journey"].includes((localStorageValue ?? "").toLowerCase());

    return {
      enabled: debugEnabled || localEnabled,
      frameEvery: 6,
      maxLogEntries: 250,
      maxJobLogs: 35
    };
  } catch {
    return { enabled: false, frameEvery: 6, maxLogEntries: 250, maxJobLogs: 35 };
  }
})();

function nowStamp() {
  return new Date().toISOString();
}

function journeyDebugLog(...args) {
  if (!JOURNEY_DEBUG_CONFIG.enabled) return;
  if (!journeyDebugLog.entries) journeyDebugLog.entries = [];
  if (journeyDebugLog.entries.length < JOURNEY_DEBUG_CONFIG.maxLogEntries) {
    journeyDebugLog.entries.push(args);
  }
  console.log("[OMJ Journey]", ...args);
}

function logJourneyState(label, payload) {
  if (!JOURNEY_DEBUG_CONFIG.enabled) return;
  journeyDebugLog(label, payload ?? {});
}

if (typeof window !== "undefined") {
  window.__OMJ_DEBUG = window.__OMJ_DEBUG ?? {};
  window.__OMJ_DEBUG.journey = {
    enabled: JOURNEY_DEBUG_CONFIG.enabled,
    log: () => journeyDebugLog.entries ?? [],
    config: JOURNEY_DEBUG_CONFIG,
    enable: (enabled = true) => {
      JOURNEY_DEBUG_CONFIG.enabled = Boolean(enabled);
      window.__OMJ_DEBUG.journey.enabled = JOURNEY_DEBUG_CONFIG.enabled;
      try {
        if (window.__OMJ_DEBUG.journey.enabled) {
          window.localStorage.setItem("omj-debug-journey", "1");
        } else {
          window.localStorage.removeItem("omj-debug-journey");
          journeyDebugLog.entries = [];
        }
      } catch {}
      if (window.__OMJ_DEBUG.journey.enabled) {
        journeyDebugLog("journey_debug_enabled", { at: nowStamp(), enabled: true });
      }
      return window.__OMJ_DEBUG.journey.enabled;
    },
    snapshot: () => {
      if (!window.__OMJ_DEBUG.journey.getMapState) return null;
      try {
        return window.__OMJ_DEBUG.journey.getMapState();
      } catch {
        return null;
      }
    },
    clear: () => {
      if (journeyDebugLog.entries) journeyDebugLog.entries = [];
    }
  };
}

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
    if (isActive) {
      tradieStepEl.removeAttribute("aria-hidden");
      const focused = tradieStepEl.querySelector(":focus");
      if (focused) focused.blur();
    } else {
      tradieStepEl.setAttribute("aria-hidden", "true");
    }
    if ("inert" in HTMLDivElement.prototype) {
      tradieStepEl.toggleAttribute("inert", !isActive);
    }
  }

  if (locationStepEl) {
    const isActive = step === 2;
    locationStepEl.classList.toggle("is-hidden", !isActive);
    if (isActive) {
      locationStepEl.removeAttribute("aria-hidden");
      const focused = locationStepEl.querySelector(":focus");
      if (focused) focused.blur();
    } else {
      locationStepEl.setAttribute("aria-hidden", "true");
    }
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

function extractLatLon(value) {
  if (!value) return { lat: null, lon: null };
  if (Array.isArray(value)) {
    if (value.length < 2) return { lat: null, lon: null };
    return {
      lat: toNumber(value[1]),
      lon: toNumber(value[0])
    };
  }

  const explicitLat = toNumber(value.lat);
  const explicitLon = toNumber(value.lon);
  if (explicitLat !== null && explicitLon !== null) {
    return { lat: explicitLat, lon: explicitLon };
  }

  return { lat: null, lon: null };
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
    const mapsUrl = new URL("https://maps.googleapis.com/maps/api/js");
    mapsUrl.searchParams.set("key", apiKey);
    mapsUrl.searchParams.set("v", "weekly");
    mapsUrl.searchParams.set("loading", "async");
    script.src = mapsUrl.toString();
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
  const JOURNEY_SPEED_MULTIPLIER = 8;
  const MAX_JOURNEY_DURATION_MS = 45000;
  const MIN_JOURNEY_DURATION_MS = 4000;

  let journeyState = null;
  let routePath = [];
  let routeProfile = null;
  let journeyDebugState = {
    frameCount: 0,
    visibleJobs: new Set(),
    started: false
  };

  let tradieMarker = null;
  let destinationMarker = null;
  let destinationLabel = "";
  let routeLine = null;
  let journeyMarker = null;

  function clamp(value, min, max) {
    if (value === null || value === undefined || Number.isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function normalizeRouteDistanceMeters(value, decimals = 1) {
    const meters = toNumber(value);
    if (meters === null) return null;
    const rounded = decimals === null || decimals === undefined ? meters : Number(meters.toFixed(decimals));
    return Number.isFinite(rounded) ? rounded : null;
  }

  function stopJourneySimulation({ clearMarker = true } = {}) {
    if (journeyState) {
      if (journeyState.frameId != null) cancelAnimationFrame(journeyState.frameId);
      journeyState = null;
    }
    if (journeyDebugState) {
      journeyDebugState.started = false;
    }
    if (clearMarker) clearJourneyMarker();
  }

  function clearJourneyMarker() {
    if (journeyMarker) {
      journeyMarker.setMap(null);
      journeyMarker = null;
    }
  }

  function clearJobs() {
    for (const job of jobMarkers) job?.marker?.setMap(null);
    jobMarkers.length = 0;
  }

  function buildRouteProfile(points) {
    const path = Array.isArray(points) ? points.filter(Boolean) : [];
    if (path.length === 0) return { path: [], cumulativeDistances: [], totalDistanceM: 0 };

    const cumulativeDistances = [0];
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1];
      const current = path[i];
      const segment = haversineDistanceMeters(previous, current);
      const safeSegment = segment === null ? 0 : segment;
      cumulativeDistances.push(cumulativeDistances[i - 1] + safeSegment);
    }

    return {
      path,
      cumulativeDistances,
      totalDistanceM: cumulativeDistances[cumulativeDistances.length - 1] || 0
    };
  }

  function nearestRoutePointIndex(point, points) {
    const normalizedPoint =
      point && typeof point.lat === "number" && typeof point.lng === "number"
        ? point
        : point && typeof point.lon === "number" && typeof point.lng === "undefined"
          ? { lat: point.lat, lng: point.lon }
          : null;
    if (!normalizedPoint || !Array.isArray(points) || points.length === 0) return null;

    let minDistance = Infinity;
    let nearestIndex = null;

    for (let i = 0; i < points.length; i += 1) {
      const candidate = points[i];
      const distance = haversineDistanceMeters(normalizedPoint, candidate);
      if (distance === null) continue;
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  function revealJobsUpToRouteIndex(routeIndex) {
    if (!Number.isFinite(routeIndex)) return;
    for (const entry of jobMarkers) {
      if (!entry?.marker) continue;
      if (entry.visible) continue;
      if (entry.routePointIndex === null || !Number.isFinite(entry.routePointIndex)) {
        if (entry.routeDistanceM === null || !Number.isFinite(entry.routeDistanceM)) continue;
      } else if (entry.routePointIndex > routeIndex) {
        continue;
      }

      entry.marker.setVisible(true);
      entry.visible = true;
      if (JOURNEY_DEBUG_CONFIG.enabled && journeyDebugState.visibleJobs.size < JOURNEY_DEBUG_CONFIG.maxJobLogs) {
        journeyDebugState.visibleJobs.add(entry.job?.id ?? `idx-${journeyDebugState.visibleJobs.size}`);
        logJourneyState("reveal_by_route_index", {
          step: routeIndex,
          markerId: entry.job?.id,
          title: entry.job?.title,
          routePointIndex: entry.routePointIndex,
          totalVisible: journeyDebugState.visibleJobs.size
        });
      }
    }
  }

  function revealJobsUpToDistance(travelDistanceM) {
    if (!Number.isFinite(travelDistanceM) || travelDistanceM < 0) return;
    for (const entry of jobMarkers) {
      if (!entry?.marker) continue;
      if (entry.visible) continue;
      if (entry.routeDistanceM === null || !Number.isFinite(entry.routeDistanceM)) continue;
      if (entry.routeDistanceM <= travelDistanceM) {
        entry.marker.setVisible(true);
        entry.visible = true;
        if (JOURNEY_DEBUG_CONFIG.enabled && journeyDebugState.visibleJobs.size < JOURNEY_DEBUG_CONFIG.maxJobLogs) {
          journeyDebugState.visibleJobs.add(entry.job?.id ?? `idx-${journeyDebugState.visibleJobs.size}`);
          logJourneyState("reveal_by_distance", {
            distanceM: travelDistanceM,
            markerDistanceM: entry.routeDistanceM,
            markerId: entry.job?.id,
            title: entry.job?.title,
            totalVisible: journeyDebugState.visibleJobs.size
          });
        }
      }
    }
  }

  function startJourneySimulation({ durationS = null } = {}) {
    if (!routePath || routePath.length < 2) return;

    stopJourneySimulation();

    const profile = routeProfile ?? buildRouteProfile(routePath);
    if (routePath.length === 0 || profile.totalDistanceM <= 0 || !Number.isFinite(profile.totalDistanceM)) {
      logJourneyState("journey_invalid_profile", {
        routePathLength: routePath.length,
        totalDistanceM: profile.totalDistanceM
      });
      return;
    }

    logJourneyState("journey_start", {
      points: profile.path.length,
      totalDistanceM: profile.totalDistanceM,
      routeDurationS: durationS,
      simDurationMs: clamp(
        (typeof durationS === "number" && Number.isFinite(durationS) ? durationS * 1000 : profile.totalDistanceM * 1000) /
          JOURNEY_SPEED_MULTIPLIER,
        MIN_JOURNEY_DURATION_MS,
        MAX_JOURNEY_DURATION_MS
      ),
      jobMarkers: jobMarkers.length,
      firstPoint: profile.path[0],
      lastPoint: profile.path[profile.path.length - 1]
    });

    if (!journeyMarker) {
      journeyMarker = new maps.Marker({
        map,
        title: "Simulated Tradie Position",
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#f59e0b",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeOpacity: 0.9,
          strokeWeight: 2
        },
        zIndex: 5
      });
    } else {
      journeyMarker.setMap(map);
    }

    journeyMarker.setPosition(routePath[0]);

    const routeDurationMs =
      typeof durationS === "number" && Number.isFinite(durationS) ? durationS * 1000 : profile.totalDistanceM * 1000;
    const durationMs = clamp(
      routeDurationMs / JOURNEY_SPEED_MULTIPLIER,
      MIN_JOURNEY_DURATION_MS,
      MAX_JOURNEY_DURATION_MS
    );

    for (const entry of jobMarkers) {
      entry.visible = false;
      entry.marker.setVisible(false);
    }
    revealJobsUpToRouteIndex(-1);

    journeyDebugState.frameCount = 0;
    journeyDebugState.visibleJobs.clear();
    journeyDebugState.started = true;

    journeyState = {
      startTs: performance.now(),
      durationMs,
      profile
    };

    const step = (timestamp) => {
      if (!journeyState) return;
      journeyState.frameCount += 1;
      const elapsed = Math.min(durationMs, Math.max(0, timestamp - journeyState.startTs));
      const ratio = profile.totalDistanceM === 0 ? 1 : elapsed / durationMs;
      const distanceNormalized = ratio * profile.totalDistanceM;
      const cumulativeDistances = journeyState.profile.cumulativeDistances;
      let segmentIndex = 0;

      while (
        segmentIndex < cumulativeDistances.length - 1 &&
        distanceNormalized >= cumulativeDistances[segmentIndex + 1]
      ) {
        segmentIndex += 1;
      }

      const routeStart = journeyState.profile.path[segmentIndex];
      const routeEnd = journeyState.profile.path[Math.min(segmentIndex + 1, journeyState.profile.path.length - 1)];
      const startDistance = cumulativeDistances[segmentIndex];
      const endDistance = cumulativeDistances[segmentIndex + 1] ?? startDistance;
      const segmentSpan = Math.max(1, endDistance - startDistance);
      const segmentProgress = clamp((distanceNormalized - startDistance) / segmentSpan, 0, 1);

      const lat = routeStart.lat + (routeEnd.lat - routeStart.lat) * segmentProgress;
      const lng = routeStart.lng + (routeEnd.lng - routeStart.lng) * segmentProgress;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        journeyMarker.setPosition({ lat, lng });
      }

      if (journeyState.frameCount % JOURNEY_DEBUG_CONFIG.frameEvery === 0) {
        logJourneyState("journey_frame", {
          frame: journeyState.frameCount,
          elapsed,
          ratio: Number(ratio.toFixed(4)),
          distanceM: Number(distanceNormalized.toFixed(2)),
          segmentIndex,
          segmentProgress: Number(segmentProgress.toFixed(4)),
          visible: jobMarkers.filter((entry) => entry.visible).length
        });
      }

      revealJobsUpToRouteIndex(segmentIndex + 1);
      revealJobsUpToDistance(distanceNormalized);

      if (elapsed < durationMs) {
        journeyState.frameId = requestAnimationFrame(step);
      } else {
        if (journeyMarker && journeyState?.profile?.path?.length) {
          const finalPosition = journeyState.profile.path[journeyState.profile.path.length - 1];
          if (finalPosition && Number.isFinite(finalPosition.lat) && Number.isFinite(finalPosition.lng)) {
            journeyMarker.setPosition(finalPosition);
          }
        }
        logJourneyState("journey_complete", {
          frames: journeyState.frameCount,
          totalDistanceM: profile.totalDistanceM,
          visibleJobs: journeyDebugState.visibleJobs.size
        });
        revealJobsUpToRouteIndex(profile.path.length - 1);
        stopJourneySimulation({ clearMarker: false });
      }
    };

    journeyState.frameId = requestAnimationFrame(step);
  }

  function clearRoute() {
    if (routeLine) routeLine.setMap(null);
    routeLine = null;
    if (destinationMarker) destinationMarker.setMap(null);
    destinationMarker = null;
    destinationLabel = "";
    routePath = [];
    routeProfile = null;
    journeyDebugState.visibleJobs.clear();
    journeyDebugState.frameCount = 0;
    stopJourneySimulation();
    clearJourneyMarker();
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

    routePath = path;
    routeProfile = buildRouteProfile(path);
  }

  function setJobs(jobs, mapSettings = {}) {
    const { routeAvgSpeedKph = null, useDetourColor = false, simulate = false } = mapSettings;

    clearJobs();
    stopJourneySimulation();
    journeyDebugState.visibleJobs.clear();
    journeyDebugState.frameCount = 0;
    const list = Array.isArray(jobs) ? jobs : [];

    logJourneyState("setJobs", {
      requestedCount: list.length,
      simulate,
      useDetourColor,
      routeAvgSpeedKph
    });

    let indexedCount = 0;
    let missingLocationCount = 0;
    for (const job of list) {
      const parsedLocation = extractLatLon(job?.location ?? job);
      const lat = parsedLocation.lat;
      const lon = parsedLocation.lon;
      if (lat === null || lon === null) {
        missingLocationCount += 1;
        if (JOURNEY_DEBUG_CONFIG.enabled && missingLocationCount <= JOURNEY_DEBUG_CONFIG.maxJobLogs) {
          logJourneyState("job_skipped", {
            reason: "missing_location",
            id: job?.id,
            title: job?.title
          });
        }
        continue;
      }

      const detourMinutes = useDetourColor ? getDetourMinutes(job, routeAvgSpeedKph) : null;
      const detourColor = getDetourColor(detourMinutes);

      const markerOpts = {
        map,
        position: { lat, lng: lon },
        title: job?.title ? String(job.title) : "Job",
        visible: !simulate
      };

      if (detourColor) {
        markerOpts.icon = buildJobMarkerIcon(maps, detourColor);
      }

      const marker = new maps.Marker(markerOpts);
      const routePointIndex = simulate ? nearestRoutePointIndex({ lat, lng }, routePath) : null;
      const routeDistanceKm = simulate ? toNumber(job?.routeDistanceKm) : null;
      const routeDistanceM = simulate
        ? routePointIndex !== null && routePointIndex >= 0 && routeProfile?.cumulativeDistances?.length
          ? normalizeRouteDistanceMeters(routeProfile.cumulativeDistances[routePointIndex], 3)
          : normalizeRouteDistanceMeters(routeDistanceKm === null ? null : routeDistanceKm * 1000, 3)
        : null;

      const entry = {
        marker,
        job,
        routePointIndex,
        routeDistanceM,
        visible: !simulate
      };

      if (simulate && JOURNEY_DEBUG_CONFIG.enabled && journeyDebugState.visibleJobs.size < JOURNEY_DEBUG_CONFIG.maxJobLogs) {
        logJourneyState("job_indexed", {
          id: job?.id,
          title: job?.title,
          routePointIndex,
          routeDistanceM
        });
      }

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

      jobMarkers.push(entry);
      indexedCount += 1;
    }

    logJourneyState("setJobs_summary", {
      indexedCount,
      missingLocationCount
    });
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
      const pos = m.marker?.getPosition();
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
    debugState() {
      return {
        journeyStarted: Boolean(journeyDebugState.started),
        journeyFrameCount: journeyDebugState.frameCount,
        jobsLoaded: jobMarkers.length,
        visibleJobs: jobMarkers.filter((entry) => entry.visible).length,
        routePathLength: routePath.length,
        routeTotalDistanceM: routeProfile?.totalDistanceM ?? null,
        destinationSet: Boolean(destinationLabel),
        destinationLabel,
        journeyMarkerVisible: Boolean(journeyMarker),
        hasRoute: Boolean(routeLine),
        journeyActive: Boolean(journeyState)
      };
    },
    map,
    setTradieLocation,
    clearTradieLocation,
    setDestination,
    clearRoute,
    setRouteGeometry,
    setJobs,
    startJourneySimulation,
    stopJourneySimulation,
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
  if (JOURNEY_DEBUG_CONFIG.enabled) params.set("debug", "journey");

  const results = await window.EnRoute.requestJson(`/api/jobs/nearby?${params.toString()}`);
  logJourneyState("nearby_request", {
    request: { address: q.start, radius: q.radius || DEFAULT_NEARBY_RADIUS, skills: q.skills || "" },
    resultCount: Array.isArray(results?.jobs) ? results.jobs.length : 0
  });
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
  if (JOURNEY_DEBUG_CONFIG.enabled) params.set("debug", "journey");

  const routeQuery = params.toString();
  logJourneyState("route_request", {
    mode: "route-search",
    destination,
    detourMinutes: q.detourMinutes || "5",
    hasStart: Boolean(q.start),
    hasSkills: Boolean(q.skills),
    simulate: Boolean(q.simulateJourney),
    query: routeQuery
  });

  const results = await window.EnRoute.requestJson(`/api/jobs/route?${routeQuery}`);
  if (!results || !Array.isArray(results.jobs) || !results.route || !results.route.geometry) {
    throw new Error("Unexpected response from server");
  }

  logJourneyState("route_search_response", {
    jobCount: results.jobs.length,
    routePoints: results.routePoints,
    routeDistanceM: results.route?.distanceM ?? null,
    routeDurationS: results.route?.durationS ?? null,
    routeGeometryPoints: Array.isArray(results.route?.geometry?.coordinates) ? results.route.geometry.coordinates.length : 0,
    startProvided: Boolean(results.start),
    endProvided: Boolean(results.end),
    simulateRequested: Boolean(q.simulateJourney)
  });

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
      simulate: Boolean(q.simulateJourney),
      useDetourColor: true,
      routeAvgSpeedKph: results.routeAvgSpeedKph ?? 40
    });
    if (q.simulateJourney) {
      logJourneyState("journey_start_triggered", {
        simulate: true,
        mapStateReady: Boolean(mapState),
        hasStartJourney: typeof mapState?.startJourneySimulation === "function"
      });
      if (typeof mapState?.startJourneySimulation === "function") {
        mapState.startJourneySimulation({ durationS: toNumber(results.route.durationS) ?? null });
      } else if (JOURNEY_DEBUG_CONFIG.enabled) {
        logJourneyState("journey_start_failed", {
          reason: "startJourneySimulation_missing"
        });
      }
    } else {
      logJourneyState("journey_start_triggered", {
        simulate: false
      });
      mapState.stopJourneySimulation();
    }
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
  const simulateJourneyInput = document.getElementById("simulateJourney");
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

  mapStatePromise.then((mapState) => {
    if (window.__OMJ_DEBUG?.journey && mapState) {
      window.__OMJ_DEBUG.journey.getMapState = () => mapState.debugState();
    }
  }).catch(() => null);

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
      mapStatePromise.then((mapState) => mapState?.stopJourneySimulation()).catch(() => null);
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
      detourMinutes: detourMinutesInput instanceof HTMLInputElement ? detourMinutesInput.value : "",
      simulateJourney:
        simulateJourneyInput instanceof HTMLInputElement ? simulateJourneyInput.checked : false
    };

    logJourneyState("form_submit", {
      mode,
      hasStart: Boolean(q.start),
      hasDestination: Boolean(q.destination),
      hasSkills: Boolean(q.skills),
      detourMinutes: q.detourMinutes,
      simulate: q.simulateJourney
    });

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
