/**
 * Home page — copy from `site/public` in Firestore (realtime).
 * Hero lines + “Our courses” marketing strip (see /admin/ → Homepage & marketing).
 */
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb } from "./fahi-firebase.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === "") return;
  el.textContent = String(value);
}

function applyCourseMarquee(d) {
  const root = document.querySelector("#our-courses .course-tabs-band__marquee");
  if (!root) return;

  const enabled = d.courseMarqueeEnabled !== false;
  root.hidden = !enabled;
  root.setAttribute("aria-hidden", enabled ? "false" : "true");
  if (!enabled) return;

  setText("site-course-marquee-eyebrow", d.courseMarqueeEyebrow);
  setText("course-tabs-marquee-heading", d.courseMarqueeHeading);
  setText("site-course-marquee-text", d.courseMarqueeBody);

  const cta = document.getElementById("site-course-marquee-cta");
  if (cta) {
    if (d.courseMarqueeCtaLabel != null && String(d.courseMarqueeCtaLabel).trim() !== "") {
      cta.textContent = String(d.courseMarqueeCtaLabel);
    }
    if (d.courseMarqueeCtaHref != null && String(d.courseMarqueeCtaHref).trim() !== "") {
      cta.setAttribute("href", String(d.courseMarqueeCtaHref).trim());
    }
  }

  const img = document.getElementById("site-course-marquee-image");
  if (img) {
    if (d.courseMarqueeImageUrl != null && String(d.courseMarqueeImageUrl).trim() !== "") {
      img.src = String(d.courseMarqueeImageUrl).trim();
    }
    if (d.courseMarqueeImageAlt != null && String(d.courseMarqueeImageAlt).trim() !== "") {
      img.alt = String(d.courseMarqueeImageAlt).trim();
    }
  }
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
      applyCourseMarquee(d);
    },
    () => {
      /* missing doc or permission: keep static HTML */
    }
  );
}

boot();
