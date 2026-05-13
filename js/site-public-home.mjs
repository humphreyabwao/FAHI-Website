/**
 * Home page — optional copy from `site/public` in the CMS (realtime).
 * Fields must match server rules for sitePublicPayload.
 */
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb } from "./fahi-firebase.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === "") return;
  el.textContent = String(value);
}

async function boot() {
  try {
    await initFirebaseApp();
  } catch {
    return;
  }
  const db = getDb();
  onSnapshot(
    doc(db, "site", "public"),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() || {};
      setText("site-hero-eyebrow", d.heroEyebrow);
      setText("site-hero-subtitle", d.heroSubtitle);
      setText("site-hero-cta-apply", d.ctaApplyLabel);
      setText("site-hero-cta-programs", d.ctaProgramsLabel);
    },
    () => {
      /* missing doc or permission: keep static HTML */
    }
  );
}

boot();
