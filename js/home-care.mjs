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

async function submitBooking(form) {
  const status = form.querySelector('[data-role="status"]');
  const submitBtn = form.querySelector('button[type="submit"]');
  hideStatus(status);

  const payload = formDataToObject(form);
  if (!payload.fullName || !payload.phone || !payload.email || !payload.location || !payload.careType || !payload.schedulePreference || !payload.details) {
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

    await addDoc(collection(db, "homeCareBookings"), {
      formType: "booking",
      payload,
      source: "home-care-page",
      submittedFromPath: window.location.pathname,
      submittedAt: serverTimestamp(),
      submitterUid: cred.user.uid,
    });

    setStatus(status, "Request received. FAHI will contact you shortly with a care plan and quote.", "is-success");
    form.reset();
  } catch (err) {
    console.error(err);
    const code = err && err.code ? String(err.code) : "";
    let msg = "Could not submit right now. Please try again or call us directly.";
    if (code === "permission-denied") {
      msg = "We could not submit due to a site configuration issue. Please call +254 733 339 477.";
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

const form = document.getElementById("home-care-booking-form");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitBooking(form);
  });
}
