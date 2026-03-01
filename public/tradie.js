function createEl(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function renderNoJobs(resultsEl) {
  resultsEl.innerHTML = "";
  const card = createEl("article", "card");
  const inner = createEl("div", "card-inner");
  const title = createEl("h3");
  title.textContent = "No jobs found";
  const p = createEl("p");
  p.textContent = "Try increasing radius, removing skills filters, or changing location.";
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

    if (job.distanceKm !== null && job.distanceKm !== undefined) {
      const pill = createEl("span", "pill");
      pill.textContent = `${Number(job.distanceKm).toFixed(2)} km away`;
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

    const accept = createEl("button", "btn primary");
    accept.type = "button";
    accept.dataset.jobId = job.id;
    accept.textContent = "Accept";

    actions.append(view, accept);
    inner.append(h3, p, pills, actions);
    card.append(inner);
    resultsEl.append(card);
  }
}

async function runSearch({ banner, resultsEl, q }) {
  window.OMJ.showBanner(banner, "", "");

  const params = new URLSearchParams({
    lat: q.lat,
    lon: q.lon,
    radius: q.radius || "5km",
    skills: q.skills || ""
  });

  const results = await window.OMJ.requestJson(`/api/jobs/nearby?${params.toString()}`);
  if (!results || !Array.isArray(results.jobs)) throw new Error("Unexpected response from server");

  if (results.jobs.length === 0) return renderNoJobs(resultsEl);
  return renderJobs(resultsEl, results.jobs);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("searchForm");
  const resultsEl = document.getElementById("results");
  const banner = document.getElementById("banner");

  if (!form || !resultsEl) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const q = {
      tradieName: String(form.tradieName.value || "").trim(),
      lat: String(form.lat.value || "").trim(),
      lon: String(form.lon.value || "").trim(),
      radius: String(form.radius.value || "").trim(),
      skills: String(form.skills.value || "").trim()
    };

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await runSearch({ banner, resultsEl, q });
    } catch (error) {
      window.OMJ.showBanner(
        banner,
        error instanceof Error ? error.message : String(error),
        "error"
      );
      resultsEl.innerHTML = "";
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  resultsEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName !== "BUTTON") return;
    if (!target.dataset.jobId) return;

    const jobId = target.dataset.jobId;
    const tradieName = String(form.tradieName.value || "").trim();
    if (!tradieName) return window.OMJ.showBanner(banner, "Enter your name first.", "error");

    target.setAttribute("disabled", "disabled");
    window.OMJ.showBanner(banner, "", "");

    try {
      await window.OMJ.requestJson(`/api/jobs/${encodeURIComponent(jobId)}/accept`, {
        method: "POST",
        body: JSON.stringify({ tradieName })
      });

      window.OMJ.showBanner(banner, "Accepted job.", "");
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    } catch (error) {
      window.OMJ.showBanner(
        banner,
        error instanceof Error ? error.message : String(error),
        "error"
      );
    } finally {
      target.removeAttribute("disabled");
    }
  });
});
