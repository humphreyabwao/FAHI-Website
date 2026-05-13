import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuthInstance, getDb, initFirebaseApp } from "./fahi-firebase.js";

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

async function submitForm(form) {
  const status = form.querySelector('[data-role="status"]');
  const submitBtn = form.querySelector('button[type="submit"]');
  hideStatus(status);

  const payload = formDataToObject(form);
  const fullName = payload.fullName || "";
  const phone = payload.phone || "";

  if (!fullName || !phone) {
    setStatus(status, "Please provide your full name and phone number.", "is-error");
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

    await addDoc(collection(db, "pathwaysEnquiries"), {
      formType: form.dataset.formType || "general",
      payload,
      source: "international-pathways-page",
      submittedFromPath: window.location.pathname,
      submittedAt: serverTimestamp(),
      submitterUid: cred.user.uid,
    });

    setStatus(status, "Submitted successfully. FAHI will contact you shortly.", "is-success");
    form.reset();
  } catch (err) {
    console.error(err);
    const code = err && err.code ? String(err.code) : "";
    let msg = "Could not submit right now. Please try again shortly.";
    if (code === "permission-denied") {
      msg =
        "We could not submit your request due to a site configuration issue. Please try again later or contact FAHI.";
    } else if (code === "auth/unauthorized-domain") {
      msg =
        "This form cannot complete sign-in from this web address. Open the page from the main FAHI website link you were given.";
    } else if (code === "auth/operation-not-allowed") {
      msg = "Sign-in for this form is not available on this site yet. Please contact FAHI.";
    } else if (code === "auth/network-request-failed") {
      msg = "Network error — check your connection and try again.";
    }
    setStatus(status, msg, "is-error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
    }
  }
}

function initPathwaysForms() {
  const form = document.getElementById("pathways-booking-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitForm(form);
  });
}

initPathwaysForms();
