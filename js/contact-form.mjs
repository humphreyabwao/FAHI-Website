import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuthInstance, getDb, initFirebaseApp } from "./fahi-firebase.js";

function show(el, text) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}

function hide(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

async function initContactForm() {
  const form = document.querySelector(".contact-form");
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const errBox = document.getElementById("contact-form-error");
  const okBox = document.getElementById("contact-form-success");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(errBox);
    hide(okBox);

    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const subject = String(fd.get("subject") || "").trim();
    const message = String(fd.get("message") || "").trim();

    if (!name || !email || !subject || !message) {
      show(errBox, "Please fill in name, email, enquiry type, and message.");
      return;
    }

    if (window.location.protocol === "file:") {
      show(
        errBox,
        "This form cannot run from a saved file. Open the site using your live https:// link or hosted preview, not file://."
      );
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

      await addDoc(collection(db, "contactEnquiries"), {
        fullName: name,
        email,
        phone: phone || "",
        subject,
        message,
        source: "home-contact-form",
        submittedFromPath: window.location.pathname,
        submittedAt: serverTimestamp(),
        submitterUid: cred.user.uid,
      });

      show(okBox, "Message sent successfully. Our team will get back to you soon.");
      form.reset();
    } catch (err) {
      console.error(err);
      const code = err && err.code ? String(err.code) : "";
      let msg = "Could not send your message right now. Please try again shortly.";
      if (code === "permission-denied") {
        msg =
          "We could not send your message due to a site configuration issue. Please try again later or contact FAHI another way.";
      } else if (code === "auth/unauthorized-domain") {
        msg =
          "This form cannot complete sign-in from this web address. Open the page from the main FAHI website link you were given.";
      } else if (code === "auth/operation-not-allowed") {
        msg = "Sign-in for this form is not available on this site yet. Please contact FAHI.";
      } else if (code === "auth/network-request-failed") {
        msg = "Network error — check your connection and try again.";
      }
      show(errBox, msg);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
      }
    }
  });
}

initContactForm();
