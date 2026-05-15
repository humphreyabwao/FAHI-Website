/**
 * /admin/ → Homepage & marketing — edit Firestore doc `site/public`.
 */
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadToCloudinarySigned } from "./cloudinary-upload.js";
import { initFirebaseApp, getDb, getAuthInstance } from "./fahi-firebase.js";

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

function setMarqueeUploadStatus(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("admin-upload-status--ok", "admin-upload-status--err");
  if (kind === "ok") el.classList.add("admin-upload-status--ok");
  if (kind === "err") el.classList.add("admin-upload-status--err");
}

/** Defaults align with index.html static fallbacks when no doc exists yet. */
const SITE_PUBLIC_DEFAULTS = {
  heroEyebrow: "Your Future in Healthcare Starts Here",
  heroSubtitle:
    "Holistic training grounded in physiology, caring, compassion and opportunity for all — locally and internationally.",
  ctaApplyLabel: "Apply Now",
  ctaProgramsLabel: "Explore Our Programs",
  courseMarqueeEyebrow: "Next intake",
  courseMarqueeHeading: "March 2026 — apply early",
  courseMarqueeBody: "Swap this line for offers, deadlines, or fee relief messaging.",
  courseMarqueeCtaLabel: "Apply now",
  courseMarqueeCtaHref: "apply/",
  courseMarqueeImageUrl:
    "https://images.unsplash.com/photo-1576091160390-112ba8d25d1d?w=640&h=400&fit=crop&q=80&auto=format",
  courseMarqueeImageAlt: "Students during healthcare skills training",
  courseMarqueeEnabled: true,
};

function asTrimmedString(v) {
  if (v == null) return "";
  return String(v).trim();
}

function fillForm(data) {
  const d = { ...SITE_PUBLIC_DEFAULTS, ...data };
  const setVal = (id, v) => {
    const el = $(id);
    if (el && "value" in el) el.value = v != null ? String(v) : "";
  };

  setVal("admin-site-hero-eyebrow", d.heroEyebrow);
  setVal("admin-site-hero-subtitle", d.heroSubtitle);
  setVal("admin-site-cta-apply", d.ctaApplyLabel);
  setVal("admin-site-cta-programs", d.ctaProgramsLabel);

  setVal("admin-course-marquee-eyebrow", d.courseMarqueeEyebrow);
  setVal("admin-course-marquee-heading", d.courseMarqueeHeading);
  setVal("admin-course-marquee-body", d.courseMarqueeBody);
  setVal("admin-course-marquee-cta-label", d.courseMarqueeCtaLabel);
  setVal("admin-course-marquee-cta-href", d.courseMarqueeCtaHref);
  setVal("admin-course-marquee-image-url", d.courseMarqueeImageUrl);
  setVal("admin-course-marquee-image-alt", d.courseMarqueeImageAlt);

  const en = $("admin-course-marquee-enabled");
  if (en && en.type === "checkbox") {
    en.checked = d.courseMarqueeEnabled !== false;
  }
}

function collectPayload() {
  return {
    heroEyebrow: asTrimmedString($("admin-site-hero-eyebrow")?.value),
    heroSubtitle: asTrimmedString($("admin-site-hero-subtitle")?.value),
    ctaApplyLabel: asTrimmedString($("admin-site-cta-apply")?.value),
    ctaProgramsLabel: asTrimmedString($("admin-site-cta-programs")?.value),
    courseMarqueeEyebrow: asTrimmedString($("admin-course-marquee-eyebrow")?.value),
    courseMarqueeHeading: asTrimmedString($("admin-course-marquee-heading")?.value),
    courseMarqueeBody: asTrimmedString($("admin-course-marquee-body")?.value),
    courseMarqueeCtaLabel: asTrimmedString($("admin-course-marquee-cta-label")?.value),
    courseMarqueeCtaHref: asTrimmedString($("admin-course-marquee-cta-href")?.value),
    courseMarqueeImageUrl: asTrimmedString($("admin-course-marquee-image-url")?.value),
    courseMarqueeImageAlt: asTrimmedString($("admin-course-marquee-image-alt")?.value),
    courseMarqueeEnabled: Boolean($("admin-course-marquee-enabled")?.checked),
  };
}

async function boot() {
  try {
    await initFirebaseApp();
  } catch (e) {
    console.warn(e);
    return;
  }

  const saveBtn = $("admin-homepage-save");
  const msg = $("admin-homepage-msg");
  if (!saveBtn || !document.querySelector('[data-admin-module="homepage"]')) return;

  let unsubDoc = null;

  saveBtn.addEventListener("click", async () => {
    hideMsg(msg);
    saveBtn.disabled = true;
    try {
      await initFirebaseApp();
      const db = getDb();
      const payload = collectPayload();
      await setDoc(doc(db, "site", "public"), payload, { merge: true });
      showMsg(msg, "Saved to Firestore (site/public).", "ok");
    } catch (e) {
      const t = e && e.message ? String(e.message) : "Save failed.";
      showMsg(msg, t, "err");
    } finally {
      saveBtn.disabled = false;
    }
  });

  const marqueeFile = $("admin-course-marquee-image-file");
  const marqueeUploadStatus = $("admin-course-marquee-image-upload-status");
  const marqueeUrlInput = $("admin-course-marquee-image-url");

  marqueeFile?.addEventListener("change", async () => {
    const file = marqueeFile.files && marqueeFile.files[0];
    if (!file) return;
    setMarqueeUploadStatus(marqueeUploadStatus, "", "");
    if (!file.type.startsWith("image/")) {
      setMarqueeUploadStatus(marqueeUploadStatus, "Choose an image file (JPEG, PNG, WebP, GIF, or AVIF).", "err");
      marqueeFile.value = "";
      return;
    }
    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMarqueeUploadStatus(marqueeUploadStatus, "Image must be 12 MB or smaller.", "err");
      marqueeFile.value = "";
      return;
    }
    setMarqueeUploadStatus(marqueeUploadStatus, "Uploading…", "");
    try {
      const uploaded = await uploadToCloudinarySigned(file, { folder: "fahi/site-marquee" });
      if (!uploaded.secureUrl) throw new Error("Upload response missing URL.");
      if (marqueeUrlInput) marqueeUrlInput.value = uploaded.secureUrl;
      setMarqueeUploadStatus(
        marqueeUploadStatus,
        `Uploaded to Cloudinary. Click Save to Firestore to publish (${uploaded.name}).`,
        "ok"
      );
    } catch (err) {
      const t = err && err.message ? String(err.message) : "Upload failed.";
      setMarqueeUploadStatus(marqueeUploadStatus, t, "err");
    } finally {
      marqueeFile.value = "";
    }
  });

  const auth = getAuthInstance();
  onAuthStateChanged(auth, (user) => {
    if (unsubDoc) {
      try {
        unsubDoc();
      } catch (_) {
        /* ignore */
      }
      unsubDoc = null;
    }
    if (!user) return;

    void (async () => {
      try {
        await initFirebaseApp();
        const db = getDb();
        const ref = doc(db, "site", "public");
        unsubDoc = onSnapshot(
          ref,
          (snap) => {
            fillForm(snap.exists() ? snap.data() || {} : {});
          },
          (err) => {
            console.warn(err);
            showMsg(msg, "Could not load site/public (check rules or network).", "err");
          }
        );
      } catch (e) {
        console.warn(e);
        showMsg(msg, "Could not subscribe to site/public.", "err");
      }
    })();
  });
}

function hideMsg(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
  el.classList.remove("admin-msg--ok", "admin-msg--err");
}

boot().catch((e) => {
  console.error(e);
});
