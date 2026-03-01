document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("postJobForm");
  const banner = document.getElementById("banner");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    window.OMJ.showBanner(banner, "", "");

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const created = await window.OMJ.requestJson("/api/jobs", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!created || !created.id) throw new Error("Unexpected response from server");
      window.location.assign(`/jobs/${created.id}`);
    } catch (error) {
      window.OMJ.showBanner(
        banner,
        error instanceof Error ? error.message : String(error),
        "error"
      );
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
});

