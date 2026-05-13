/**
 * FAHI — Programs mega dropdown — live catalogue (realtime) or JSON fallback.
 * #mega-programs-mount: data-programs-json, data-programs-base; body needs data-js-base.
 */
(function () {
  const GROUPS = window.FAHI_PROGRAM_GROUPS || [];

  function esc(s) {
    if (s == null || s === "") return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function paintMega(mount, base, programs) {
    const byGroup = {};
    GROUPS.forEach((g) => {
      byGroup[g.id] = [];
    });

    programs.forEach((p) => {
      const gid = p.megaGroup && byGroup[p.megaGroup] != null ? p.megaGroup : "support";
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(p);
    });

    const cols = GROUPS.map((g) => {
      const list = (byGroup[g.id] || []).slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      if (!list.length) return "";
      const items = list
        .map((p) => `<li><a href="${esc(base)}view/?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></li>`)
        .join("");
      return `<div class="mega__col mega__col--dynamic"><h4 class="mega__title">${esc(g.title)}</h4><ul class="mega__list">${items}</ul></div>`;
    }).join("");

    mount.innerHTML =
      cols ||
      `<div class="mega__col mega__col--dynamic"><p class="mega__empty">No programmes listed yet.</p></div>`;
  }

  async function fillMega() {
    const mount = document.getElementById("mega-programs-mount");
    if (!mount || !GROUPS.length) return;

    const jsonPath = mount.getAttribute("data-programs-json");
    const base = mount.getAttribute("data-programs-base") || "./programs/";
    const jsBase = document.body.dataset.jsBase;
    if (!jsonPath || !jsBase) return;

    const jsonUrl = new URL(jsonPath, window.location.href).href;
    const moduleUrl = new URL("fahi-programs-data.js", new URL(jsBase, window.location.href).href).href;

    let api;
    try {
      api = await import(moduleUrl);
    } catch (e) {
      mount.innerHTML =
        '<div class="mega__col mega__col--dynamic"><p class="mega__empty">Could not load programme module.</p></div>';
      return;
    }

    const onErr = () => {
      mount.innerHTML =
        '<div class="mega__col mega__col--dynamic"><p class="mega__empty">Programmes could not be loaded. Open <a href="' +
        base +
        '">All programmes</a>.</p></div>';
    };

    try {
      await api.subscribeProgramsList(
        jsonUrl,
        ({ programs }) => paintMega(mount, base, programs),
        onErr
      );
    } catch (e) {
      onErr();
    }
  }

  document.addEventListener("siteChromeLoaded", fillMega, { once: true });
})();
