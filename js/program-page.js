/**
 * FAHI programme detail — live catalogue (realtime) with JSON fallback.
 * Body: data-program-slug, data-programs-json (fallback), data-js-base (e.g. ../../js/)
 * Optional: data-program-realtime="false" to disable live updates.
 */
(function () {
  const body = document.body;
  const slugFromBody = (body.dataset.programSlug && String(body.dataset.programSlug).trim()) || "";
  const slugFromQuery = new URLSearchParams(window.location.search).get("slug");
  const slug = slugFromBody || (slugFromQuery && String(slugFromQuery).trim()) || "";
  const jsonPath = body.dataset.programsJson;
  const jsBase = body.dataset.jsBase;
  const realtime = body.dataset.programRealtime !== "false";
  const mount = document.getElementById("program-mount");
  const loading = document.getElementById("program-loading");
  const errBox = document.getElementById("program-error");

  function esc(s) {
    if (s == null || s === "") return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function seoBase() {
    const m = document.querySelector('meta[name="fa-seo-base"]');
    if (!m) return "https://firstamericanhealthinstitute.org";
    return m.getAttribute("content").replace(/\/$/, "");
  }

  function setHeadMeta(key, value, isProperty) {
    if (value == null || value === "") return;
    const attr = isProperty ? "property" : "name";
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", value);
  }

  function programCanonicalPath() {
    if (typeof window !== "undefined" && window.location.pathname.indexOf("/programs/view") !== -1) {
      return `/programs/view/?slug=${encodeURIComponent(slug)}`;
    }
    return `/programs/${slug}/`;
  }

  function refreshProgramSeo(p) {
    const base = seoBase();
    const pageUrl = `${base.replace(/\/$/, "")}${programCanonicalPath()}`;
    const desc =
      p.metaDescription ||
      (p.intro ? String(p.intro).replace(/\s+/g, " ").trim().slice(0, 160) : "");
    const titleStr = `${p.title} | FAHI`;
    const ogImage = /^https?:\/\//i.test(p.heroImage || "") ? p.heroImage : "";

    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.rel = "canonical";
      document.head.appendChild(canon);
    }
    canon.href = pageUrl;

    setHeadMeta("og:title", titleStr, true);
    setHeadMeta("og:description", desc, true);
    setHeadMeta("og:url", pageUrl, true);
    if (ogImage) setHeadMeta("og:image", ogImage, true);
    setHeadMeta("twitter:title", titleStr, false);
    setHeadMeta("twitter:description", desc, false);
    if (ogImage) setHeadMeta("twitter:image", ogImage, false);

    const ldEl = document.getElementById("fahi-program-seo-ld");
    if (!ldEl) return;
    const courseLd = {
      "@type": "Course",
      name: p.title,
      description: desc,
      url: pageUrl,
      provider: {
        "@type": "EducationalOrganization",
        name: "First American Health Institute",
        url: `${base}/`,
      },
    };
    if (ogImage) courseLd.image = [ogImage];
    if (p.eyebrow) courseLd.educationalLevel = p.eyebrow;
    const breadcrumbLd = {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "Programmes", item: `${base}/programs/` },
        { "@type": "ListItem", position: 3, name: p.title, item: pageUrl },
      ],
    };
    ldEl.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [courseLd, breadcrumbLd],
    });
  }

  function iconTag(iconClass) {
    const cls = iconClass && iconClass.indexOf("fa-") === 0 ? iconClass : "fa-file-lines";
    return `<i class="fa-solid ${esc(cls)}" aria-hidden="true"></i>`;
  }

  function buildFacts(facts) {
    if (!facts || !facts.length) return "";
    return facts
      .map(
        (f) => `
        <div class="program-fact">
          <span class="program-fact__label">${esc(f.label)}</span>
          <span class="program-fact__value">${esc(f.value)}</span>
        </div>`
      )
      .join("");
  }

  function buildFeeRows(rows) {
    if (!rows || !rows.length) return "";
    return rows
      .map(
        (r) => `
        <tr>
          <td>${esc(r.item)}</td>
          <td>${esc(r.detail)}</td>
        </tr>`
      )
      .join("");
  }

  function buildBullets(items) {
    if (!items || !items.length) return "<p class=\"program-prose\">Curriculum details will be published in the official outline.</p>";
    return `<ul class="program-list">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  }

  function buildDownloads(intro, list) {
    if (!list || !list.length) {
      return `
      <section class="program-section" id="downloads" aria-labelledby="downloads-heading">
        <h2 id="downloads-heading" class="program-section__title">Download fee structure</h2>
        <p class="program-prose">Fee structure and related documents will be linked here when they are ready.</p>
      </section>`;
    }
    const links = list
      .map(
        (d) => `
        <a href="${esc(d.href)}" class="program-download"${d.href === "#" ? ' rel="nofollow"' : ""}>
          <span>${esc(d.label)}</span>${iconTag(d.icon)}
        </a>`
      )
      .join("");
    return `
      <section class="program-section" id="downloads" aria-labelledby="downloads-heading">
        <h2 id="downloads-heading" class="program-section__title">Download fee structure</h2>
        <h3 class="program-section__heading">Documents &amp; forms</h3>
        ${intro ? `<p class="program-prose">${esc(intro)}</p>` : ""}
        <div class="program-downloads">${links}</div>
      </section>`;
  }

  function render(p) {
    const defaultApplyHref = `../../apply/?program=${encodeURIComponent(slug)}`;
    const rawPrimaryHref = p.ctaPrimary && p.ctaPrimary.href ? String(p.ctaPrimary.href).trim() : "";
    const primaryHref =
      !rawPrimaryHref || rawPrimaryHref.endsWith("#contact") ? defaultApplyHref : rawPrimaryHref;

    const factsHtml = buildFacts(p.facts);
    const feeRowsHtml = buildFeeRows(p.feeRows);
    const bulletsHtml = buildBullets(p.curriculumBullets);
    const downloadsHtml = buildDownloads(p.downloadsIntro, p.downloads);

    const feesBlock =
      feeRowsHtml.length > 0
        ? `
        <div class="program-table-wrap">
          <table class="program-table">
            <thead><tr><th scope="col">Item</th><th scope="col">Details</th></tr></thead>
            <tbody>${feeRowsHtml}</tbody>
          </table>
        </div>`
        : `<p class="program-prose">See admissions for a detailed fee schedule.</p>`;

    const secondary = p.ctaSecondary
      ? `<a href="${esc(p.ctaSecondary.href)}" class="btn btn--ghost">${esc(p.ctaSecondary.label)}</a>`
      : "";

    mount.innerHTML = `
      <article class="program-hero">
        <div class="container program-hero__grid">
          <figure class="program-hero__media">
            <img src="${esc(p.heroImage)}" alt="${esc(p.heroImageAlt || p.title)}" width="800" height="600" loading="eager" decoding="async" />
          </figure>
          <div class="program-hero__content">
            <p class="program-hero__eyebrow">${esc(p.eyebrow || "Program")}</p>
            <h1 class="program-hero__title">${esc(p.title)}</h1>
            <p class="program-hero__lead">${esc(p.intro)}</p>
            <div class="program-hero__actions">
              <a href="${esc(primaryHref)}" class="btn btn--primary">${esc(
                p.ctaPrimary && p.ctaPrimary.label ? p.ctaPrimary.label : "Apply Now"
              )} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
              <a href="#downloads" class="btn btn--ghost-blue">Download fee structure <i class="fa-solid fa-download" aria-hidden="true"></i></a>
            </div>
            ${factsHtml ? `<div class="program-facts" aria-label="Program key facts">${factsHtml}</div>` : ""}
          </div>
        </div>
      </article>

      <div class="container program-body">
        <section class="program-section" id="requirements" aria-labelledby="requirements-heading">
          <h2 id="requirements-heading" class="program-section__title">Requirements</h2>
          <h3 class="program-section__heading">Entry requirement</h3>
          <p class="program-prose">${esc(p.entryRequirement || "See admissions for entry criteria.")}</p>
          <h3 class="program-section__heading program-section__heading--spaced">Mode of study</h3>
          <p class="program-prose">${esc(p.modeOfStudy || "Contact FAHI for available modes for this intake.")}</p>
        </section>

        <section class="program-section" id="fees" aria-labelledby="fees-heading">
          <h2 id="fees-heading" class="program-section__title">Fees &amp; structure</h2>
          <h3 class="program-section__heading">Tuition overview</h3>
          <p class="program-prose">${esc(p.feesSummary || "")}</p>
          ${feesBlock}
        </section>

        <section class="program-section" id="curriculum" aria-labelledby="curriculum-heading">
          <h2 id="curriculum-heading" class="program-section__title">Program structure</h2>
          <h3 class="program-section__heading">What you will cover</h3>
          <p class="program-prose">${esc(p.curriculumIntro || "")}</p>
          ${bulletsHtml}
        </section>

        ${downloadsHtml}

        <section class="program-section" id="careers" aria-labelledby="careers-heading">
          <h2 id="careers-heading" class="program-section__title">Employment opportunities</h2>
          <p class="program-prose">${esc(p.employment || "")}</p>
        </section>
      </div>

      <section class="program-cta-band" aria-label="Apply">
        <div class="container program-cta-band__inner">
          <p class="program-cta-band__text">${esc(p.ctaHeadline || "Apply to FAHI today.")}</p>
          <div class="program-cta-band__actions">
            <a href="${esc(primaryHref)}" class="btn btn--white">${esc(
              p.ctaPrimary && p.ctaPrimary.label ? p.ctaPrimary.label : "Apply Now"
            )} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
            ${secondary}
          </div>
        </div>
      </section>

      <p class="program-footer-note container">© First American Health Institute Kenya · <a href="../../">Return to home</a> · <a href="../../programs/">All programs</a></p>
    `;

    document.title = `${p.title} | FAHI`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      const d =
        p.metaDescription ||
        (p.intro ? String(p.intro).replace(/\s+/g, " ").trim().slice(0, 160) : "");
      if (d) meta.setAttribute("content", d);
    }
    refreshProgramSeo(p);
  }

  function showError(msg) {
    if (loading) loading.hidden = true;
    if (mount) mount.innerHTML = "";
    if (errBox) {
      errBox.hidden = false;
      errBox.textContent = msg || "Could not load this programme.";
    }
  }

  if (!slug || !jsonPath || !mount) {
    showError("Program page is misconfigured (missing slug or mount).");
    return;
  }

  if (!jsBase) {
    showError("Missing data-js-base on &lt;body&gt; (path to js/ folder).");
    return;
  }

  const jsonUrl = new URL(jsonPath, window.location.href).href;
  const moduleUrl = new URL("fahi-programs-data.js", new URL(jsBase, window.location.href).href).href;

  let unsub = () => {};

  (async function boot() {
    let api;
    try {
      api = await import(moduleUrl);
    } catch (e) {
      showError("Could not load programme data module. Check data-js-base.");
      return;
    }

    const onProgram = (p) => {
      if (!p) {
        showError("This programme was not found. Return to the programmes list.");
        return;
      }
      if (loading) loading.hidden = true;
      if (errBox) errBox.hidden = true;
      render(p);
      mount.hidden = false;
    };

    try {
      if (realtime) {
        unsub = await api.subscribeProgramBySlug(
          slug,
          jsonUrl,
          onProgram,
          (err) => {
            if (err && err.message === "not-found") {
              showError("This programme was not found. Return to the programmes list.");
            } else {
              showError("Could not load programme data. Check your connection and try again.");
            }
          }
        );
      } else {
        const { program } = await api.fetchProgramBySlug(slug, jsonUrl);
        onProgram(program);
      }
    } catch (e) {
      showError("Could not load programme data. Use HTTPS hosting or try again later.");
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
