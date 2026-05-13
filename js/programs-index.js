/**
 * FAHI — programmes index — live catalogue (realtime) or JSON fallback.
 * Body: data-programs-json, data-js-base (e.g. ../js/)
 */
(function () {
  const mount = document.getElementById("programs-index-mount");
  const loading = document.getElementById("programs-index-loading");
  const errBox = document.getElementById("programs-index-error");
  const jsonPath = document.body.dataset.programsJson || "../data/programs.json";
  const jsBase = document.body.dataset.jsBase;
  const GROUPS = window.FAHI_PROGRAM_GROUPS || [];

  const DEFAULT_CARD_IMAGE =
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=500&fit=crop&q=80&auto=format";

  function esc(s) {
    if (s == null || s === "") return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function factsLine(p) {
    if (!p.facts || !p.facts.length) return "";
    return p.facts
      .slice(0, 2)
      .map((f) => `${f.label}: ${f.value}`)
      .join(" · ");
  }

  function groupId(p) {
    if (p.megaGroup && GROUPS.some((g) => g.id === p.megaGroup)) return p.megaGroup;
    return "support";
  }

  function buildCard(p) {
    const img = (p.heroImage && String(p.heroImage).trim()) || DEFAULT_CARD_IMAGE;
    const alt = p.heroImageAlt || p.title || "Programme";
    const meta = factsLine(p);
    return `
        <a class="program-card program-card--media" href="./view/?slug=${encodeURIComponent(p.slug)}">
          <div class="program-card__media">
            <img src="${esc(img)}" alt="${esc(alt)}" width="480" height="300" loading="lazy" decoding="async" />
          </div>
          <div class="program-card__body">
            <span class="program-card__eyebrow">${esc(p.eyebrow || "Programme")}</span>
            <span class="program-card__title">${esc(p.title)}</span>
            ${meta ? `<span class="program-card__meta">${esc(meta)}</span>` : ""}
            <span class="program-card__cta">View details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
          </div>
        </a>`;
  }

  function paint(programs) {
    const byGroup = {};
    GROUPS.forEach((g) => {
      byGroup[g.id] = [];
    });
    programs.forEach((p) => {
      const gid = groupId(p);
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(p);
    });

    const sections = GROUPS.map((g) => {
      const list = (byGroup[g.id] || []).slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      if (!list.length) return "";
      const cards = list.map(buildCard).join("");
      return `
        <section class="programs-index-group" aria-labelledby="programs-group-${g.id}">
          <h2 id="programs-group-${g.id}" class="programs-index-group__title">${esc(g.title)}</h2>
          <div class="programs-index-grid">${cards}</div>
        </section>`;
    }).join("");

    mount.innerHTML = sections || '<p class="program-state">No programmes in the catalogue yet.</p>';
    if (loading) loading.hidden = true;
    mount.hidden = false;
  }

  if (!mount) return;

  if (!jsBase) {
    if (loading) loading.hidden = true;
    if (errBox) {
      errBox.hidden = false;
      errBox.textContent = "Missing data-js-base on body (path to js/).";
    }
    return;
  }

  const jsonUrl = new URL(jsonPath, window.location.href).href;
  const moduleUrl = new URL("fahi-programs-data.js", new URL(jsBase, window.location.href).href).href;

  let unsub = () => {};

  (async function () {
    let api;
    try {
      api = await import(moduleUrl);
    } catch (e) {
      if (loading) loading.hidden = true;
      if (errBox) {
        errBox.hidden = false;
        errBox.textContent = "Could not load data module.";
      }
      return;
    }

    try {
      unsub = await api.subscribeProgramsList(
        jsonUrl,
        ({ programs }) => paint(programs),
        () => {
          if (loading) loading.hidden = true;
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent =
              "Could not load programmes. Check your network or serve over HTTPS (not file://).";
          }
        }
      );
    } catch (e) {
      if (loading) loading.hidden = true;
      if (errBox) {
        errBox.hidden = false;
        errBox.textContent = "Could not subscribe to programme data.";
      }
    }

    window.addEventListener(
      "pagehide",
      () => {
        try {
          unsub();
        } catch (_) {}
      },
      { once: true }
    );
  })();
})();
