/**
 * /admin/ → Lease equipment catalogue — Firestore `leaseEquipment` + Cloudinary images.
 */
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadToCloudinarySigned } from "./cloudinary-upload.js";
import { initFirebaseApp, getDb, getAuthInstance } from "./fahi-firebase.js";
import { buildPriceLabel, PRICE_PERIODS, resolvePriceLabel } from "./lease-equipment-shared.mjs";

function $(id) {
  return document.getElementById(id);
}

function showMsg(el, text, kind) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.remove("admin-msg--ok", "admin-msg--err");
  if (kind === "ok") el.classList.add("admin-msg--ok");
  if (kind === "err") el.classList.add("admin-msg--err");
}

function hideMsg(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

function setUploadStatus(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("admin-upload-status--ok", "admin-upload-status--err");
  if (kind === "ok") el.classList.add("admin-upload-status--ok");
  if (kind === "err") el.classList.add("admin-upload-status--err");
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let items = [];
let selectedSlug = null;
let unsubList = null;

function updatePricePreview() {
  const preview = $("admin-lease-price-preview");
  if (!preview) return;
  const label = buildPriceLabel(
    $("admin-lease-price-currency")?.value,
    $("admin-lease-price-amount")?.value,
    $("admin-lease-price-period")?.value
  );
  preview.textContent = label || "Enter amount and period to preview price.";
}

function updateImagePreview(url) {
  const wrap = $("admin-lease-image-preview");
  if (!wrap) return;
  const u = String(url || "").trim();
  if (!u) {
    wrap.innerHTML = '<p class="admin-lease-preview__empty">Upload or paste an image URL to preview.</p>';
    return;
  }
  const alt = escapeHtml($("admin-lease-image-alt")?.value || $("admin-lease-title")?.value || "Equipment");
  wrap.innerHTML = `<img src="${escapeHtml(u)}" alt="${alt}" loading="lazy" decoding="async" />`;
}

function renderList() {
  const list = $("admin-lease-list");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<p class="admin-head-note">No equipment yet. Click <strong>+ New</strong> to add items.</p>';
    return;
  }
  list.innerHTML = items
    .map((it) => {
      const price = resolvePriceLabel(it);
      return (
        `<button type="button" class="admin-lease-list__btn${it.id === selectedSlug ? " is-active" : ""}" data-slug="${escapeHtml(it.id)}">` +
        `<strong>${escapeHtml(it.title || it.id)}</strong>` +
        `<span>${escapeHtml(price || "No price set")} · ${escapeHtml(it.category || "")}</span>` +
        `</button>`
      );
    })
    .join("");

  list.querySelectorAll("[data-slug]").forEach((btn) => {
    btn.addEventListener("click", () => selectItem(btn.getAttribute("data-slug")));
  });
}

function fillForm(data) {
  const d = data || {};
  $("admin-lease-slug").value = selectedSlug || "";
  $("admin-lease-title").value = d.title || "";
  $("admin-lease-category").value = d.category || "";
  $("admin-lease-description").value = d.description || "";
  $("admin-lease-image-url").value = d.imageUrl || "";
  $("admin-lease-image-alt").value = d.imageAlt || "";
  $("admin-lease-sort").value = d.sortOrder != null ? String(d.sortOrder) : "10";
  $("admin-lease-price-currency").value = d.priceCurrency || "KSh";
  $("admin-lease-price-amount").value =
    d.priceAmount != null && d.priceAmount !== "" ? String(d.priceAmount) : "";
  const periodEl = $("admin-lease-price-period");
  if (periodEl) {
    const period = d.pricePeriod || "24 hrs";
    const known = PRICE_PERIODS.some((p) => p.value === period);
    periodEl.value = known ? period : "custom";
    const custom = $("admin-lease-price-period-custom");
    if (custom) {
      custom.hidden = periodEl.value !== "custom";
      custom.value = periodEl.value === "custom" ? period : "";
    }
  }
  const avail = $("admin-lease-available");
  if (avail) avail.checked = d.available !== false;
  updatePricePreview();
  updateImagePreview(d.imageUrl);
}

function selectItem(slug) {
  selectedSlug = slug;
  const found = items.find((i) => i.id === slug);
  fillForm(found || {});
  renderList();
}

function getPricePeriodValue() {
  const sel = $("admin-lease-price-period");
  if (!sel) return "24 hrs";
  if (sel.value === "custom") {
    return ($("admin-lease-price-period-custom")?.value || "").trim() || "24 hrs";
  }
  return sel.value || "24 hrs";
}

function collectPayload() {
  const sortRaw = parseInt($("admin-lease-sort").value, 10);
  const amountRaw = $("admin-lease-price-amount").value.trim();
  const priceAmount = amountRaw === "" ? null : Number(amountRaw);
  const priceCurrency = ($("admin-lease-price-currency").value || "KSh").trim();
  const pricePeriod = getPricePeriodValue();
  const priceLabel =
    priceAmount != null && !Number.isNaN(priceAmount)
      ? buildPriceLabel(priceCurrency, priceAmount, pricePeriod)
      : "";

  return {
    title: $("admin-lease-title").value.trim(),
    category: $("admin-lease-category").value.trim(),
    description: $("admin-lease-description").value.trim(),
    imageUrl: $("admin-lease-image-url").value.trim(),
    imageAlt: $("admin-lease-image-alt").value.trim(),
    sortOrder: Number.isNaN(sortRaw) ? 10 : sortRaw,
    available: $("admin-lease-available").checked,
    priceAmount: priceAmount != null && !Number.isNaN(priceAmount) ? priceAmount : null,
    priceCurrency,
    pricePeriod,
    priceLabel,
  };
}

async function saveItem() {
  const msg = $("admin-lease-msg");
  hideMsg(msg);
  const slugInput = $("admin-lease-slug").value.trim();
  const slug = slugify(slugInput || $("admin-lease-title").value);
  if (!slug) {
    showMsg(msg, "Enter a title or URL slug.", "err");
    return;
  }
  const payload = collectPayload();
  if (!payload.title) {
    showMsg(msg, "Title is required.", "err");
    return;
  }
  if (!payload.imageUrl) {
    showMsg(msg, "Upload an image to Cloudinary or paste an image URL.", "err");
    return;
  }
  if (payload.priceAmount == null) {
    showMsg(msg, "Lease price amount is required (e.g. 2500 for KSh 2,500 / 24 hrs).", "err");
    return;
  }

  try {
    await initFirebaseApp();
    const db = getDb();
    await setDoc(doc(db, "leaseEquipment", slug), payload, { merge: true });
    selectedSlug = slug;
    showMsg(msg, "Saved — live on /equipment-leasing/ now.", "ok");
  } catch (e) {
    console.error(e);
    showMsg(msg, e.message || "Save failed.", "err");
  }
}

async function deleteItem() {
  const msg = $("admin-lease-msg");
  hideMsg(msg);
  const slug = slugify($("admin-lease-slug").value);
  if (!slug) return;
  if (!window.confirm(`Delete “${slug}” from the catalogue?`)) return;

  try {
    await initFirebaseApp();
    const db = getDb();
    await deleteDoc(doc(db, "leaseEquipment", slug));
    selectedSlug = null;
    fillForm({});
    $("admin-lease-slug").value = "";
    showMsg(msg, "Deleted.", "ok");
  } catch (e) {
    console.error(e);
    showMsg(msg, e.message || "Delete failed.", "err");
  }
}

function newItem() {
  selectedSlug = null;
  fillForm({
    available: true,
    sortOrder: items.length + 1,
    priceCurrency: "KSh",
    pricePeriod: "24 hrs",
  });
  $("admin-lease-slug").value = "";
  renderList();
}

function boot() {
  const periodSel = $("admin-lease-price-period");
  periodSel?.addEventListener("change", () => {
    const custom = $("admin-lease-price-period-custom");
    if (custom) custom.hidden = periodSel.value !== "custom";
    updatePricePreview();
  });
  ["admin-lease-price-currency", "admin-lease-price-amount", "admin-lease-price-period-custom"].forEach((id) => {
    $(id)?.addEventListener("input", updatePricePreview);
  });
  $("admin-lease-image-url")?.addEventListener("input", (e) => updateImagePreview(e.target.value));
  $("admin-lease-title")?.addEventListener("input", () => updateImagePreview($("admin-lease-image-url")?.value));

  $("admin-lease-save")?.addEventListener("click", () => saveItem());
  $("admin-lease-delete")?.addEventListener("click", () => deleteItem());
  $("admin-lease-new")?.addEventListener("click", () => newItem());

  const uploadInput = $("admin-lease-image-file");
  const uploadStatus = $("admin-lease-upload-status");
  uploadInput?.addEventListener("change", async () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadStatus(uploadStatus, "Choose a JPEG, PNG, WebP, or GIF image.", "err");
      uploadInput.value = "";
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setUploadStatus(uploadStatus, "Image must be 12 MB or smaller.", "err");
      uploadInput.value = "";
      return;
    }
    setUploadStatus(uploadStatus, "Uploading to Cloudinary…", "");
    try {
      await initFirebaseApp();
      const uploaded = await uploadToCloudinarySigned(file, { folder: "fahi/lease-equipment" });
      const url = uploaded.secureUrl || "";
      if ($("admin-lease-image-url")) $("admin-lease-image-url").value = url;
      if (!$("admin-lease-image-alt").value && $("admin-lease-title").value) {
        $("admin-lease-image-alt").value = $("admin-lease-title").value.trim();
      }
      updateImagePreview(url);
      setUploadStatus(uploadStatus, "Uploaded — click Save to publish to the website.", "ok");
    } catch (e) {
      setUploadStatus(uploadStatus, e.message || "Upload failed.", "err");
    } finally {
      uploadInput.value = "";
    }
  });

  const auth = getAuthInstance();
  onAuthStateChanged(auth, (user) => {
    if (unsubList) {
      try {
        unsubList();
      } catch (_) {
        /* ignore */
      }
      unsubList = null;
    }
    if (!user) return;

    void (async () => {
      await initFirebaseApp();
      const db = getDb();
      unsubList = onSnapshot(
        collection(db, "leaseEquipment"),
        (snap) => {
          items = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
          renderList();
          if (selectedSlug) {
            const found = items.find((i) => i.id === selectedSlug);
            if (found) fillForm(found);
          }
          const countEl = $("admin-count-lease");
          if (countEl) countEl.textContent = String(items.length);
        },
        (err) => {
          console.warn(err);
          showMsg($("admin-lease-msg"), "Could not load leaseEquipment.", "err");
        }
      );
    })();
  });
}

boot().catch(console.error);
