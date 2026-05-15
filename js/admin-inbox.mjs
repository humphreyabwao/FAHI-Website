/**
 * /admin/ — realtime inbox feeds for form submissions (Firestore).
 */
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb, getAuthInstance } from "./fahi-firebase.js";

const FIELD_LABELS = {
  fullName: "Full name",
  email: "Email",
  phone: "Phone / WhatsApp",
  location: "Location",
  careType: "Type of care",
  schedulePreference: "Preferred schedule",
  details: "Details",
  equipmentItem: "Equipment",
  leaseDuration: "Lease duration",
};

const VALUE_LABELS = {
  "personal-care": "Personal care (ADLs)",
  "post-hospital": "Post-hospital recovery",
  palliative: "Palliative / hospice",
  elderly: "Elderly / disability support",
  "nursing-clinical": "Nurse / clinician-led care",
  escort: "Patient escort",
  other: "Other / not sure",
  "12h-day": "12-hour day shift",
  "12h-night": "12-hour night shift",
  "live-in": "Live-in / long-term",
  visits: "Scheduled visits",
  assessment: "Assessment only (quote first)",
  "1-7-days": "1–7 days",
  "1-4-weeks": "1–4 weeks",
  "1-3-months": "1–3 months",
  "long-term": "Longer term",
};

const COLLECTION_FIELDS = {
  homeCareBookings: ["fullName", "email", "phone", "location", "careType", "schedulePreference", "details"],
  equipmentLeaseEnquiries: ["equipmentItem", "fullName", "email", "phone", "location", "leaseDuration", "details"],
};

const unsubByRoot = new WeakMap();
const selectedByInbox = new WeakMap();

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(ts) {
  if (!ts) return "—";
  try {
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function displayValue(key, raw) {
  if (raw == null || String(raw).trim() === "") return "—";
  if (key === "details") return String(raw).trim();
  return VALUE_LABELS[String(raw)] || String(raw);
}

function setCount(countId, n) {
  const el = document.getElementById(countId);
  if (el) el.textContent = String(n);
}

function mountInboxShell(root) {
  const listId = root.getAttribute("data-inbox-list-id");
  const detailId = root.getAttribute("data-inbox-detail-id");
  const statusId = root.getAttribute("data-inbox-status-id");
  if (!listId || !detailId || !statusId) return null;

  root.innerHTML =
    '<p class="admin-inbox__status" id="' +
    statusId +
    '">Connecting…</p>' +
    '<div class="admin-inbox-layout">' +
    '<div class="admin-inbox-list" id="' +
    listId +
    '" role="list" aria-label="Submissions"></div>' +
    '<div class="admin-inbox-detail" id="' +
    detailId +
    '">' +
    '<p class="admin-inbox-detail__empty">Select a submission to view details.</p>' +
    "</div></div>";

  return {
    listEl: document.getElementById(listId),
    detailEl: document.getElementById(detailId),
    statusEl: document.getElementById(statusId),
  };
}

function renderDetail(detailEl, doc, collectionName) {
  if (!detailEl || !doc) return;
  const data = doc.data || {};
  const payload = data.payload || {};
  const fields = COLLECTION_FIELDS[collectionName] || Object.keys(payload);

  const rows = fields
    .map((key) => {
      const label = FIELD_LABELS[key] || key;
      const raw = payload[key];
      const text = displayValue(key, raw);
      let cell;
      if (key === "details") {
        cell = '<div class="admin-inbox-detail__block">' + escapeHtml(text) + "</div>";
      } else if (key === "email" && text !== "—") {
        cell = '<a href="mailto:' + escapeHtml(String(raw)) + '">' + escapeHtml(text) + "</a>";
      } else if (key === "phone" && text !== "—") {
        const tel = String(raw).replace(/\s/g, "");
        cell = '<a href="tel:' + escapeHtml(tel) + '">' + escapeHtml(text) + "</a>";
      } else {
        cell = escapeHtml(text);
      }
      return (
        '<div class="admin-inbox-detail__row"><dt>' +
        escapeHtml(label) +
        "</dt><dd>" +
        cell +
        "</dd></div>"
      );
    })
    .join("");

  detailEl.innerHTML =
    '<div class="admin-inbox-detail__head"><h2>' +
    escapeHtml(payload.fullName || "Submission") +
    '</h2><p class="admin-inbox-detail__meta">Received ' +
    escapeHtml(formatWhen(data.submittedAt)) +
    "</p></div>" +
    '<dl class="admin-inbox-detail__grid">' +
    rows +
    "</dl>" +
    '<p class="admin-inbox-detail__foot">ID: <code>' +
    escapeHtml(doc.id) +
    "</code></p>";

}

function listSubtitle(payload, collectionName) {
  if (collectionName === "equipmentLeaseEnquiries") {
    return displayValue("equipmentItem", payload.equipmentItem);
  }
  return displayValue("careType", payload.careType);
}

function renderList(listEl, detailEl, docs, collectionName, root) {
  if (!listEl) return;
  let selectedId = selectedByInbox.get(root);

  if (!docs.length) {
    listEl.innerHTML = '<p class="admin-inbox-list__empty">No submissions yet.</p>';
    if (detailEl) {
      detailEl.innerHTML =
        '<p class="admin-inbox-detail__empty">New bookings from the website will appear here in realtime.</p>';
    }
    return;
  }

  if (!selectedId || !docs.some((d) => d.id === selectedId)) {
    selectedId = docs[0].id;
    selectedByInbox.set(root, selectedId);
  }

  listEl.innerHTML = docs
    .map((doc) => {
      const data = doc.data || {};
      const p = data.payload || {};
      const active = doc.id === selectedId ? " is-active" : "";
      return (
        '<button type="button" class="admin-inbox-item' +
        active +
        '" data-doc-id="' +
        escapeHtml(doc.id) +
        '" role="listitem">' +
        '<span class="admin-inbox-item__title">' +
        escapeHtml(p.fullName || "No name") +
        "</span>" +
        '<span class="admin-inbox-item__meta">' +
        escapeHtml(formatWhen(data.submittedAt)) +
        " · " +
        escapeHtml(p.phone || "") +
        "</span>" +
        '<span class="admin-inbox-item__tag">' +
        escapeHtml(listSubtitle(p, collectionName)) +
        "</span></button>"
      );
    })
    .join("");

  listEl.querySelectorAll("[data-doc-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-doc-id");
      selectedByInbox.set(root, id);
      listEl.querySelectorAll(".admin-inbox-item").forEach((el) => {
        el.classList.toggle("is-active", el.getAttribute("data-doc-id") === id);
      });
      const doc = docs.find((d) => d.id === id);
      renderDetail(detailEl, doc, collectionName);
    });
  });

  const activeDoc = docs.find((d) => d.id === selectedId);
  if (activeDoc) renderDetail(detailEl, activeDoc, collectionName);
}

function startInbox(root) {
  const collectionName = root.getAttribute("data-inbox-collection");
  const countId = root.getAttribute("data-inbox-count-id");
  if (!collectionName) return;

  const ui = mountInboxShell(root);
  if (!ui) return;

  const { listEl, detailEl, statusEl } = ui;

  const unsub = onSnapshot(
    collection(getDb(), collectionName),
    (snap) => {
      if (statusEl) {
        statusEl.textContent = snap.size + " submission" + (snap.size === 1 ? "" : "s") + " · live";
        statusEl.classList.remove("admin-inbox__status--err");
      }
      if (countId) setCount(countId, snap.size);

      const docs = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .sort((a, b) => {
          const ma = a.data.submittedAt && a.data.submittedAt.toMillis ? a.data.submittedAt.toMillis() : 0;
          const mb = b.data.submittedAt && b.data.submittedAt.toMillis ? b.data.submittedAt.toMillis() : 0;
          return mb - ma;
        });

      renderList(listEl, detailEl, docs, collectionName, root);
    },
    (err) => {
      console.warn(err);
      if (statusEl) {
        statusEl.textContent =
          "Could not load submissions. Deploy updated Firestore rules and sign in as an admin.";
        statusEl.classList.add("admin-inbox__status--err");
      }
      if (countId) setCount(countId, "—");
      if (listEl) listEl.innerHTML = "";
    }
  );

  unsubByRoot.set(root, unsub);
}

function stopInbox(root) {
  const unsub = unsubByRoot.get(root);
  if (unsub) {
    try {
      unsub();
    } catch (_) {
      /* ignore */
    }
    unsubByRoot.delete(root);
  }
  selectedByInbox.delete(root);
}

function boot() {
  const roots = document.querySelectorAll(".admin-inbox[data-inbox-collection]");
  if (!roots.length) return;

  const auth = getAuthInstance();
  onAuthStateChanged(auth, (user) => {
    roots.forEach((root) => stopInbox(root));
    if (!user) return;

    void (async () => {
      try {
        await initFirebaseApp();
        roots.forEach((root) => startInbox(root));
      } catch (e) {
        console.warn(e);
      }
    })();
  });
}

boot().catch(console.error);
