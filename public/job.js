async function loadJob(jobId) {
  const banner = document.getElementById("banner");

  const titleEl = document.getElementById("jobTitle");
  const descriptionEl = document.getElementById("jobDescription");
  const statusEl = document.getElementById("jobStatus");
  const skillsEl = document.getElementById("jobSkills");
  const toolsEl = document.getElementById("jobTools");
  const priceEl = document.getElementById("jobPrice");
  const addressEl = document.getElementById("jobAddress");
  const latEl = document.getElementById("jobLat");
  const lonEl = document.getElementById("jobLon");
  const createdEl = document.getElementById("jobCreated");
  const acceptedByEl = document.getElementById("jobAcceptedBy");

  const acceptForm = document.getElementById("acceptForm");
  const actions = document.getElementById("jobActions");

  window.EnRoute.showBanner(banner, "", "");

  const job = await window.EnRoute.requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);

  document.title = `${job.title ?? "Job"} · EnRoute`;
  if (titleEl) titleEl.textContent = job.title ?? "Job";
  if (descriptionEl)
    descriptionEl.textContent = job.description?.trim() ? job.description : "No description provided.";
  if (statusEl) statusEl.textContent = job.status ?? "—";
  if (skillsEl)
    skillsEl.textContent = Array.isArray(job.skills) && job.skills.length ? job.skills.join(", ") : "—";
  if (toolsEl)
    toolsEl.textContent = Array.isArray(job.tools) && job.tools.length ? job.tools.join(", ") : "—";
  if (priceEl)
    priceEl.textContent =
      job.price === null || job.price === undefined ? "—" : `$${job.price}`;
  if (addressEl)
    addressEl.textContent =
      typeof job.addressLabel === "string" && job.addressLabel.trim()
        ? job.addressLabel
        : typeof job.address === "string" && job.address.trim()
          ? job.address
          : "—";
  if (latEl) latEl.textContent = job.location?.lat ?? "—";
  if (lonEl) lonEl.textContent = job.location?.lon ?? "—";
  if (createdEl) createdEl.textContent = window.EnRoute.formatDateTime(job.createdAt);
  if (acceptedByEl) acceptedByEl.textContent = job.acceptedBy?.name ?? "—";

  const isOpen = job.status === "open";
  if (acceptForm) acceptForm.hidden = !isOpen;
  if (actions) actions.hidden = isOpen;
}

document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("banner");
  const acceptForm = document.getElementById("acceptForm");

  const jobId = window.EnRoute.parseJobIdFromPath();
  if (!jobId) return window.EnRoute.showBanner(banner, "Missing job id.", "error");

  loadJob(jobId).catch((error) => {
    window.EnRoute.showBanner(
      banner,
      error instanceof Error ? error.message : String(error),
      "error"
    );
  });

  if (acceptForm) {
    acceptForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      window.EnRoute.showBanner(banner, "", "");

      const formData = new FormData(acceptForm);
      const tradieName = String(formData.get("tradieName") || "").trim();
      if (!tradieName) return window.EnRoute.showBanner(banner, "tradieName is required", "error");

      const submitButton = acceptForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        await window.EnRoute.requestJson(`/api/jobs/${encodeURIComponent(jobId)}/accept`, {
          method: "POST",
          body: JSON.stringify({ tradieName })
        });
        await loadJob(jobId);
      } catch (error) {
        window.EnRoute.showBanner(
          banner,
          error instanceof Error ? error.message : String(error),
          "error"
        );
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }
});
