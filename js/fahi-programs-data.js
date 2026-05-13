/**
 * FAHI programmes — live CMS first (collection "programs", doc id = slug), JSON fallback, optional realtime.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb } from "./fahi-firebase.js";
import { normalizeProgramMedia } from "./fahi-cloudinary.js";

function sortPrograms(list) {
  return list.slice().sort((a, b) => {
    const oa = a.sortOrder != null ? Number(a.sortOrder) : 9999;
    const ob = b.sortOrder != null ? Number(b.sortOrder) : 9999;
    if (oa !== ob) return oa - ob;
    return (a.title || "").localeCompare(b.title || "");
  });
}

async function loadProgramsFromJson(jsonUrl) {
  const r = await fetch(jsonUrl);
  if (!r.ok) throw new Error(`JSON HTTP ${r.status}`);
  const data = await r.json();
  const programs = (data.programs || []).map((p) => normalizeProgramMedia(p));
  return sortPrograms(programs);
}

async function loadProgramsFromFirestore() {
  await initFirebaseApp();
  const db = getDb();
  const snap = await getDocs(collection(db, "programs"));
  if (snap.empty) throw new Error("Programme catalogue is empty on the server");
  const programs = [];
  snap.forEach((d) => {
    const raw = d.data() || {};
    const slug = raw.slug || d.id;
    programs.push(normalizeProgramMedia({ slug, ...raw }));
  });
  return sortPrograms(programs);
}

/**
 * One-shot load: live catalogue if data exists, else JSON file.
 * @returns {{ programs: object[], source: 'firestore'|'json' }}
 */
export async function fetchProgramsList(jsonFallbackUrl) {
  const url = new URL(jsonFallbackUrl, window.location.href).href;
  try {
    const programs = await loadProgramsFromFirestore();
    return { programs, source: "firestore" };
  } catch (e) {
    console.warn("[FAHI] Using programmes JSON fallback:", e && e.message ? e.message : e);
    const programs = await loadProgramsFromJson(url);
    return { programs, source: "json" };
  }
}

/**
 * @returns {{ program: object|null, source: 'firestore'|'json' }}
 */
export async function fetchProgramBySlug(slug, jsonFallbackUrl) {
  const url = new URL(jsonFallbackUrl, window.location.href).href;
  try {
    await initFirebaseApp();
    const db = getDb();
    const ref = doc(db, "programs", slug);
    const s = await getDoc(ref);
    if (s.exists()) {
      const raw = s.data() || {};
      return { program: normalizeProgramMedia({ slug, ...raw }), source: "firestore" };
    }
  } catch (e) {
    console.warn("[FAHI] Programme read failed, trying JSON:", e && e.message ? e.message : e);
  }
  const programs = await loadProgramsFromJson(url);
  const program = programs.find((x) => x.slug === slug) || null;
  return { program, source: "json" };
}

/**
 * Realtime programme list. Falls back to one JSON fetch if the live catalogue is unavailable.
 * @returns {Promise<() => void>} unsubscribe function
 */
export async function subscribeProgramsList(jsonFallbackUrl, onData, onError) {
  const url = new URL(jsonFallbackUrl, window.location.href).href;
  try {
    await initFirebaseApp();
    const db = getDb();
    const col = collection(db, "programs");
    const unsub = onSnapshot(
      col,
      (snap) => {
        if (snap.empty) {
          loadProgramsFromJson(url)
            .then((programs) => onData({ programs, source: "json" }))
            .catch((err) => onError(err));
          return;
        }
        const programs = [];
        snap.forEach((d) => {
          const raw = d.data() || {};
          const slug = raw.slug || d.id;
          programs.push(normalizeProgramMedia({ slug, ...raw }));
        });
        onData({ programs: sortPrograms(programs), source: "firestore" });
      },
      (err) => {
        console.warn("[FAHI] programmes snapshot error, JSON fallback:", err);
        loadProgramsFromJson(url)
          .then((programs) => onData({ programs, source: "json" }))
          .catch((e) => onError(e));
      }
    );
    return unsub;
  } catch (e) {
    try {
      const programs = await loadProgramsFromJson(url);
      onData({ programs, source: "json" });
    } catch (err) {
      onError(err);
    }
    return () => {};
  }
}

/**
 * Realtime single programme document.
 * @returns {Promise<() => void>}
 */
export async function subscribeProgramBySlug(slug, jsonFallbackUrl, onData, onError) {
  const url = new URL(jsonFallbackUrl, window.location.href).href;
  try {
    await initFirebaseApp();
    const db = getDb();
    const ref = doc(db, "programs", slug);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          fetchProgramBySlug(slug, url)
            .then(({ program }) => {
              if (program) onData(program);
              else onError(new Error("not-found"));
            })
            .catch(onError);
          return;
        }
        const raw = snap.data() || {};
        onData(normalizeProgramMedia({ slug, ...raw }));
      },
      (err) => {
        console.warn("[FAHI] programme snapshot error:", err);
        fetchProgramBySlug(slug, url)
          .then(({ program }) => {
            if (program) onData(program);
            else onError(new Error("not-found"));
          })
          .catch(onError);
      }
    );
    return unsub;
  } catch (e) {
    try {
      const { program } = await fetchProgramBySlug(slug, url);
      if (program) onData(program);
      else onError(new Error("not-found"));
    } catch (err) {
      onError(err);
    }
    return () => {};
  }
}
