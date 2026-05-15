import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuthInstance, getDb, initFirebaseApp } from "./fahi-firebase.js";
import { resolvePriceLabel } from "./lease-equipment-shared.mjs";

const FALLBACK_JSON = "../data/lease-equipment.json";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(el, text, kind) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.remove("is-error", "is-success");
  if (kind) el.classList.add(kind);
}

function hideStatus(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
  el.classList.remove("is-error", "is-success");
}

function formDataToObject(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [k, v] of fd.entries()) {
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

function renderCard(item) {
  const title = item.title || "Equipment";
  const titleEsc = escapeHtml(title);
  const text = escapeHtml(item.description || "");
  const cat = escapeHtml(item.category || "Clinical");
  const img = escapeHtml(item.imageUrl || "");
  const alt = escapeHtml(item.imageAlt || title);
  const id = escapeHtml(item.id || item.slug || title);
  const price = escapeHtml(resolvePriceLabel(item));
  const priceHtml = price
    ? '<p class="svc-equip-card__price">' + price + '</p>'
    : '<p class="svc-equip-card__price svc-equip-card__price--muted">Price on request</p>';

  return (
    '<article class="svc-equip-card" role="listitem" data-equipment-id="' + id + '">' +
    '<div class="svc-equip-card__media"><img src="' + img + '" alt="' + alt + '" loading="lazy" decoding="async" /></div>' +
    '<div class="svc-equip-card__body">' +
    '<p class="svc-equip-card__cat">' + cat + '</p>' +
    '<h3 class="svc-equip-card__title">' + titleEsc + '</h3>' +
    priceHtml +
    '<p class="svc-equip-card__text">' + text + '</p>' +
    '<button type="button" class="btn btn--primary svc-equip-card__btn" data-lease-item="' + id +
    '" data-lease-title="' + titleEsc + '" data-lease-price="' + price + '">Lease now</button>' +
    '</div></article>'
  );
}

let allCatalogItems = [];
let catalogSearchQuery = "";
let lastCardsPerPage = 0;
let lastPaginationPageCount = 0;
let catalogResizeTimer = null;
let catalogSearchTimer = null;

function itemSearchText(item) {
  return [
    item.title,
    item.category,
    item.description,
    item.id,
    item.slug,
    resolvePriceLabel(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterItemsBySearch(items, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => itemSearchText(item).includes(q));
}

function updateCatalogSearchUi() {
  const wrap = document.getElementById("equipment-catalog-search-wrap");
  const input = document.getElementById("equipment-catalog-search");
  const clearBtn = document.getElementById("equipment-catalog-search-clear");
  const hasQuery = Boolean(String(catalogSearchQuery || "").trim());
  if (wrap) wrap.classList.toggle("is-expanded", hasQuery);
  if (clearBtn) clearBtn.hidden = !hasQuery;
  if (input && input.value !== catalogSearchQuery) input.value = catalogSearchQuery;
}

function applyCatalogView(opts = {}) {
  const filtered = filterItemsBySearch(allCatalogItems, catalogSearchQuery);
  mountCatalog(filtered, opts);
}

function setCatalogSource(items) {
  allCatalogItems = items.filter((i) => i && i.available !== false);
  const searchWrap = document.getElementById("equipment-catalog-search-wrap");
  if (searchWrap) searchWrap.hidden = allCatalogItems.length === 0;
  applyCatalogView({ preservePage: 0 });
}

function initCatalogSearch() {
  const input = document.getElementById("equipment-catalog-search");
  const clearBtn = document.getElementById("equipment-catalog-search-clear");
  const field = document.getElementById("equipment-catalog-search-field");
  if (!input || input.dataset.searchInit === "1") return;
  input.dataset.searchInit = "1";

  field?.addEventListener("click", (e) => {
    if (e.target.closest(".svc-catalog-search__clear")) return;
    input.focus();
  });

  const runSearch = () => {
    catalogSearchQuery = input.value;
    updateCatalogSearchUi();
    applyCatalogView({ preservePage: 0 });
  };

  input.addEventListener("input", () => {
    clearTimeout(catalogSearchTimer);
    catalogSearchTimer = setTimeout(runSearch, 180);
  });
  input.addEventListener("search", runSearch);

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    catalogSearchQuery = "";
    updateCatalogSearchUi();
    input.focus();
    applyCatalogView({ preservePage: 0 });
  });
}

function getCardsPerPage() {
  const outer = document.getElementById("equipment-catalog-outer");
  if (!outer) return 4;
  const raw = getComputedStyle(outer).getPropertyValue("--svc-catalog-cols").trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

function getPageCount(track) {
  return track?.querySelectorAll(".svc-catalog-page").length || 0;
}

function getCurrentPage(track) {
  if (!track?.clientWidth) return 0;
  return Math.round(track.scrollLeft / track.clientWidth);
}

function scrollToPage(track, index, smooth = true) {
  const count = getPageCount(track);
  if (!count || !track.clientWidth) return;
  const page = Math.max(0, Math.min(index, count - 1));
  track.scrollTo({
    left: page * track.clientWidth,
    behavior: smooth ? "smooth" : "auto",
  });
}

function buildCatalogPagesHtml(items) {
  const perPage = getCardsPerPage();
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage));
  }
  if (!pages.length) return "";
  return pages
    .map(
      (pageItems, pageIndex) =>
        '<div class="svc-catalog-page" role="group" aria-label="Page ' +
        (pageIndex + 1) +
        " of " +
        pages.length +
        '">' +
        pageItems.map(renderCard).join("") +
        "</div>"
    )
    .join("");
}

function bindCatalogCardClicks(track) {
  track.querySelectorAll("[data-lease-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const title = btn.getAttribute("data-lease-title") || "";
      const price = btn.getAttribute("data-lease-price") || "";
      const input = document.getElementById("lease-equipment-item");
      if (input) {
        input.value = price ? `${title} (${price})` : title;
      }
      document.getElementById("lease-request")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderPaginationDots(track) {
  const nav = document.getElementById("equipment-catalog-pagination");
  const dotsEl = document.getElementById("equipment-catalog-dots");
  const pageCount = getPageCount(track);
  if (!nav || !dotsEl) return;

  if (pageCount <= 1) {
    nav.hidden = true;
    dotsEl.innerHTML = "";
    lastPaginationPageCount = pageCount;
    return;
  }

  nav.hidden = false;
  const current = getCurrentPage(track);
  dotsEl.innerHTML = Array.from({ length: pageCount }, (_, i) => {
    const active = i === current;
    return (
      '<button type="button" class="svc-catalog-dot' +
      (active ? " is-active" : "") +
      '" role="tab" aria-label="Page ' +
      (i + 1) +
      '" aria-selected="' +
      active +
      '" data-page="' +
      i +
      '"></button>'
    );
  }).join("");

  dotsEl.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      scrollToPage(track, Number(btn.getAttribute("data-page")));
    });
  });
  lastPaginationPageCount = pageCount;
  updatePaginationState(track);
}

function updatePaginationState(track) {
  const pageCount = getPageCount(track);
  const current = getCurrentPage(track);
  const dotsEl = document.getElementById("equipment-catalog-dots");
  const label = document.getElementById("equipment-catalog-page-label");
  const nav = document.getElementById("equipment-catalog-pagination");

  if (nav) nav.hidden = pageCount <= 1;
  dotsEl?.querySelectorAll(".svc-catalog-dot").forEach((dot, i) => {
    const active = i === current;
    dot.classList.toggle("is-active", active);
    dot.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (label) {
    label.textContent = pageCount > 1 ? `Page ${current + 1} of ${pageCount}` : "";
  }
}

function refreshCatalogPagination() {
  const track = document.getElementById("equipment-catalog-track");
  if (!track) return;
  const count = getPageCount(track);
  if (count !== lastPaginationPageCount) {
    renderPaginationDots(track);
  } else {
    updatePaginationState(track);
  }
  track._updateCatalogUi?.();
}

function onCatalogResize() {
  clearTimeout(catalogResizeTimer);
  catalogResizeTimer = setTimeout(() => {
    const per = getCardsPerPage();
    const track = document.getElementById("equipment-catalog-track");
    if (!track || !allCatalogItems.length) {
      refreshCatalogPagination();
      return;
    }
    if (per !== lastCardsPerPage) {
      const page = getCurrentPage(track);
      applyCatalogView({ preservePage: page });
    } else {
      refreshCatalogPagination();
    }
  }, 150);
}

function initCatalogScrollControls() {
  const track = document.getElementById("equipment-catalog-track");
  const arrowL = document.getElementById("equipment-catalog-prev");
  const arrowR = document.getElementById("equipment-catalog-next");
  if (!track || !arrowL || !arrowR || track.dataset.scrollInit === "1") return;
  track.dataset.scrollInit = "1";

  const updateUi = () => {
    const { scrollLeft, scrollWidth, clientWidth } = track;
    arrowL.classList.toggle("is-visible", scrollLeft > 4);
    arrowR.classList.toggle("is-visible", scrollLeft + clientWidth < scrollWidth - 4);
    updatePaginationState(track);
  };

  arrowL.addEventListener("click", () => {
    scrollToPage(track, getCurrentPage(track) - 1);
  });
  arrowR.addEventListener("click", () => {
    scrollToPage(track, getCurrentPage(track) + 1);
  });

  track.addEventListener("scroll", updateUi, { passive: true });
  window.addEventListener("resize", onCatalogResize);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => refreshCatalogPagination()).observe(track);
  }

  track._updateCatalogUi = updateUi;
  updateUi();
}

function mountCatalog(items, opts = {}) {
  const track = document.getElementById("equipment-catalog-track");
  const empty = document.getElementById("equipment-catalog-empty");
  const noResults = document.getElementById("equipment-catalog-no-results");
  const outer = document.getElementById("equipment-catalog-outer");
  if (!track) return;

  const visible = items;
  lastCardsPerPage = getCardsPerPage();
  const hasCatalog = allCatalogItems.length > 0;
  const isSearching = Boolean(String(catalogSearchQuery || "").trim());

  if (!visible.length) {
    track.innerHTML = "";
    if (empty) empty.hidden = hasCatalog;
    if (noResults) noResults.hidden = !hasCatalog || !isSearching;
    if (outer) outer.hidden = !hasCatalog;
    lastPaginationPageCount = 0;
    const pagination = document.getElementById("equipment-catalog-pagination");
    if (pagination) pagination.hidden = true;
    refreshCatalogPagination();
    return;
  }

  if (empty) empty.hidden = true;
  if (noResults) noResults.hidden = true;
  if (outer) outer.hidden = false;
  track.innerHTML = buildCatalogPagesHtml(visible);
  bindCatalogCardClicks(track);

  const preservePage = opts.preservePage ?? 0;
  requestAnimationFrame(() => {
    scrollToPage(track, preservePage, false);
    refreshCatalogPagination();
  });
}

async function loadFallback() {
  try {
    const res = await fetch(FALLBACK_JSON);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

async function initCatalog() {
  const track = document.getElementById("equipment-catalog-track");
  if (!track) return;

  initCatalogScrollControls();
  initCatalogSearch();

  let firestoreHasItems = false;

  try {
    await initFirebaseApp();
    const db = getDb();
    onSnapshot(
      collection(db, "leaseEquipment"),
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
        if (items.length) {
          firestoreHasItems = true;
          setCatalogSource(items);
        } else if (!firestoreHasItems) {
          loadFallback().then(setCatalogSource);
        } else {
          setCatalogSource([]);
        }
      },
      () => loadFallback().then(setCatalogSource)
    );
  } catch {
    setCatalogSource(await loadFallback());
  }

  const itemParam = new URLSearchParams(window.location.search).get("item");
  const input = document.getElementById("lease-equipment-item");
  if (itemParam && input) input.value = itemParam;
}

async function submitLeaseForm(form) {
  const status = form.querySelector('[data-role="status"]');
  const submitBtn = form.querySelector('button[type="submit"]');
  hideStatus(status);

  const payload = formDataToObject(form);
  if (
    !payload.equipmentItem ||
    !payload.fullName ||
    !payload.phone ||
    !payload.email ||
    !payload.location ||
    !payload.leaseDuration ||
    !payload.details
  ) {
    setStatus(status, "Please complete all required fields.", "is-error");
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }

    await initFirebaseApp();
    const auth = getAuthInstance();
    const db = getDb();
    const cred = await signInAnonymously(auth);

    await addDoc(collection(db, "equipmentLeaseEnquiries"), {
      formType: "lease",
      payload,
      source: "equipment-leasing-page",
      submittedFromPath: window.location.pathname,
      submittedAt: serverTimestamp(),
      submitterUid: cred.user.uid,
    });

    setStatus(status, "Lease request received. FAHI will confirm availability and pricing shortly.", "is-success");
    form.reset();
  } catch (err) {
    console.error(err);
    let msg = "Could not submit right now. Please try again or contact us by phone.";
    if (err && err.code === "permission-denied") {
      msg = "We could not submit due to a site configuration issue. Please call +254 733 339 477.";
    }
    setStatus(status, msg, "is-error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
    }
  }
}

const leaseForm = document.getElementById("equipment-lease-form");
if (leaseForm) {
  leaseForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitLeaseForm(leaseForm);
  });
}

initCatalog();
