/**
 * About page — instructors, tutors, and in-house staff from the live CMS (realtime).
 * Falls back to data/about-team-seed.json if the collection is empty or unreachable.
 */
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb } from "./fahi-firebase.js";
import { resolveTeamMemberImageUrl } from "./fahi-cloudinary.js";

const SEED_PATH = "../data/about-team-seed.json";

function esc(s) {
  if (s == null || s === "") return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function resolveLocalOrAbsoluteImageUrl(raw) {
  const u = String(raw || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("../")) return new URL(u, window.location.href).href;
  return new URL(`../${u.replace(/^\//, "")}`, window.location.href).href;
}

function cardClass(category) {
  if (category === "instructor") return "instructor-card";
  if (category === "tutor") return "tutor-card";
  return "staff-card";
}

function buildCard(category, row) {
  const c = cardClass(category);
  const src = resolveTeamMemberImageUrl(row, resolveLocalOrAbsoluteImageUrl);
  const alt = row.imageAlt || row.name || "Team member";
  const img =
    src.length > 0
      ? `<img src="${esc(src)}" alt="${esc(alt)}" width="360" height="320" loading="lazy" decoding="async" />`
      : `<div class="${c}__media ${c}__media--placeholder" role="img" aria-label="${esc(alt)}"></div>`;
  return `
    <article class="${c}">
      <figure class="${c}__media">${img}</figure>
      <div class="${c}__body">
        <h3 class="${c}__name">${esc(row.name)}</h3>
        <p class="${c}__role">${esc(row.role)}</p>
        <p class="${c}__bio">${esc(row.bio)}</p>
      </div>
    </article>`;
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const oa = a.sortOrder != null ? Number(a.sortOrder) : 9999;
    const ob = b.sortOrder != null ? Number(b.sortOrder) : 9999;
    if (oa !== ob) return oa - ob;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function renderGrids(mounts, rows) {
  const ins = sortRows(rows.filter((r) => r.category === "instructor"));
  const tut = sortRows(rows.filter((r) => r.category === "tutor"));
  const stf = sortRows(rows.filter((r) => r.category === "staff"));

  mounts.instructors.innerHTML = ins.map((r) => buildCard("instructor", r)).join("");
  mounts.tutors.innerHTML = tut.map((r) => buildCard("tutor", r)).join("");
  mounts.staff.innerHTML = stf.map((r) => buildCard("staff", r)).join("");

  [mounts.instructors, mounts.tutors, mounts.staff].forEach((el) => {
    el.hidden = false;
  });
}

async function loadSeedMembers() {
  const url = new URL(SEED_PATH, window.location.href).href;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`seed ${r.status}`);
  const data = await r.json();
  const members = data.members || [];
  return members.map((m) => ({
    id: m.id,
    category: m.category,
    sortOrder: m.sortOrder,
    name: m.name,
    role: m.role,
    bio: m.bio,
    imageUrl: m.imageUrl,
    imageAlt: m.imageAlt,
    imagePublicId: m.imagePublicId != null ? String(m.imagePublicId) : "",
    imageVersion:
      typeof m.imageVersion === "number" && !Number.isNaN(m.imageVersion)
        ? m.imageVersion
        : parseInt(String(m.imageVersion || 0), 10) || 0,
  }));
}

async function boot() {
  const statusEl = document.getElementById("about-team-status");
  const mounts = {
    instructors: document.getElementById("about-instructors-mount"),
    tutors: document.getElementById("about-tutors-mount"),
    staff: document.getElementById("about-staff-mount"),
  };
  if (!mounts.instructors || !mounts.tutors || !mounts.staff) return;

  if (statusEl) {
    statusEl.textContent = "Loading team…";
    statusEl.hidden = false;
  }

  let usedFallback = false;

  const applyRows = (rows, msg) => {
    if (statusEl) {
      statusEl.textContent = msg || "";
      statusEl.hidden = !msg;
    }
    if (!rows.length) {
      mounts.instructors.innerHTML = "";
      mounts.tutors.innerHTML = "";
      mounts.staff.innerHTML = "";
      mounts.instructors.hidden = false;
      mounts.tutors.hidden = false;
      mounts.staff.hidden = false;
      if (statusEl) {
        statusEl.textContent =
          "Team profiles are not available yet. They will appear here automatically once the team directory is published.";
        statusEl.hidden = false;
      }
      return;
    }
    renderGrids(mounts, rows);
  };

  const tryFallback = async () => {
    if (usedFallback) return;
    try {
      const rows = await loadSeedMembers();
      usedFallback = true;
      applyRows(
        rows,
        rows.length
          ? "Showing bundled team list. Connect the live team directory for automatic updates from the CMS."
          : ""
      );
    } catch (e) {
      applyRows([], "");
      if (statusEl) {
        statusEl.textContent = "Could not load team data.";
        statusEl.hidden = false;
      }
    }
  };

  try {
    await initFirebaseApp();
    const db = getDb();
    onSnapshot(
      collection(db, "aboutTeamMembers"),
      (snap) => {
        const rows = [];
        snap.forEach((d) => {
          rows.push({ id: d.id, ...(d.data() || {}) });
        });
        if (rows.length === 0) {
          void tryFallback();
          return;
        }
        usedFallback = false;
        applyRows(rows, "");
      },
      () => {
        void tryFallback();
      }
    );
  } catch {
    void tryFallback();
  }
}

boot();
