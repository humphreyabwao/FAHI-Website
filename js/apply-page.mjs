/**
 * FAHI unified application form — /apply/
 * Anonymous browser sign-in + hosted application storage.
 * Cloudinary: signed browser uploads through backend signature endpoint.
 */
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb, getAuthInstance } from "./fahi-firebase.js";
import { uploadToCloudinarySigned } from "./cloudinary-upload.js";
import { fetchProgramsList, subscribeProgramsList } from "./fahi-programs-data.js";
import {
  getCloudinarySignatureEndpoint,
  getCloudinaryUnsignedUploadPreset,
} from "./fahi-config.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 8;
const ACCEPT_NAME_RE = /\.(pdf|jpe?g|png)$/i;
const ACCEPT_MIME_RE = /^(application\/pdf|image\/(jpeg|png))$/i;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeAllowed(file) {
  const mime = file.type || "";
  if (ACCEPT_MIME_RE.test(mime)) return true;
  return ACCEPT_NAME_RE.test(file.name || "");
}

function fileDedupeKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function safeFileName(name) {
  return String(name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

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

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function val(id) {
  const el = document.getElementById(id);
  return el && "value" in el ? String(el.value).trim() : "";
}

/** Backend store rejects undefined field values — strip at root only */
function omitUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function syncPrefillNote(prefillNote, bySlug, programSlugFromUrl) {
  if (!prefillNote) return;
  if (programSlugFromUrl && bySlug[programSlugFromUrl]) {
    prefillNote.hidden = false;
    prefillNote.textContent = `Programme pre-selected from your link: ${bySlug[programSlugFromUrl].title}. You can change it below if needed.`;
  } else {
    hide(prefillNote);
  }
}

async function init() {
  const form = document.getElementById("fahi-application-form");
  const select = document.getElementById("apply-program");
  const hint = document.getElementById("apply-program-hint");
  const prefillNote = document.getElementById("apply-prefill-note");
  const errBox = document.getElementById("apply-form-error");
  const okBox = document.getElementById("apply-form-success");
  const submitBtn = document.getElementById("apply-submit");
  const jsonPath = document.body.dataset.programsJson || "../data/programs.json";
  const jsBase = document.body.dataset.jsBase;
  if (!form || !select || !jsBase) return;

  const programSlugFromUrl = new URLSearchParams(window.location.search).get("program");

  const filesInput = document.getElementById("apply-files");
  const dropzone = document.getElementById("apply-dropzone");
  const fileListEl = document.getElementById("apply-file-list");
  const uploadFeedback = document.getElementById("apply-upload-feedback");

  /** @type {File[]} */
  const attachmentFiles = [];

  function hideUploadFeedback() {
    if (!uploadFeedback) return;
    uploadFeedback.hidden = true;
    uploadFeedback.textContent = "";
  }

  function showUploadFeedback(msg) {
    if (!uploadFeedback) return;
    uploadFeedback.hidden = false;
    uploadFeedback.textContent = msg;
  }

  function syncAttachmentInput() {
    if (!filesInput) return;
    const dt = new DataTransfer();
    attachmentFiles.forEach((f) => dt.items.add(f));
    filesInput.files = dt.files;
  }

  function renderAttachmentList() {
    if (!fileListEl) return;
    fileListEl.innerHTML = "";
    attachmentFiles.forEach((file) => {
      const li = document.createElement("li");
      li.className = "apply-file-item";
      const iconWrap = document.createElement("span");
      iconWrap.className = "apply-file-item__icon";
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      iconWrap.innerHTML = isPdf
        ? '<i class="fa-solid fa-file-pdf" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-file-image" aria-hidden="true"></i>';
      const meta = document.createElement("div");
      meta.className = "apply-file-item__meta";
      const nameEl = document.createElement("div");
      nameEl.className = "apply-file-item__name";
      nameEl.textContent = file.name;
      const sizeEl = document.createElement("div");
      sizeEl.className = "apply-file-item__size";
      sizeEl.textContent = formatFileSize(file.size);
      meta.append(nameEl, sizeEl);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "apply-file-item__remove";
      rm.setAttribute("aria-label", `Remove ${file.name}`);
      rm.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
      rm.addEventListener("click", () => {
        const i = attachmentFiles.indexOf(file);
        if (i !== -1) attachmentFiles.splice(i, 1);
        hideUploadFeedback();
        syncAttachmentInput();
        renderAttachmentList();
      });
      li.append(iconWrap, meta, rm);
      fileListEl.appendChild(li);
    });
  }

  function addAttachmentFiles(incoming) {
    if (!incoming.length) return;
    const messages = [];
    for (const file of incoming) {
      if (attachmentFiles.length >= MAX_FILES) {
        messages.push(`Only ${MAX_FILES} files are allowed (remaining files were not added).`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        messages.push(`“${file.name}” is over 10 MB.`);
        continue;
      }
      if (!fileTypeAllowed(file)) {
        messages.push(`“${file.name}” is not a supported type (PDF, JPG, or PNG).`);
        continue;
      }
      const key = fileDedupeKey(file);
      if (attachmentFiles.some((f) => fileDedupeKey(f) === key)) {
        continue;
      }
      attachmentFiles.push(file);
    }
    syncAttachmentInput();
    renderAttachmentList();
    if (messages.length) {
      showUploadFeedback(messages.join(" "));
    } else {
      hideUploadFeedback();
    }
  }

  if (filesInput && dropzone) {
    dropzone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("apply-dropzone--active");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const related = e.relatedTarget;
      if (!related || !dropzone.contains(related)) {
        dropzone.classList.remove("apply-dropzone--active");
      }
    });
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("apply-dropzone--active");
      const list = e.dataTransfer?.files;
      if (list && list.length) {
        addAttachmentFiles(Array.from(list));
      }
    });
    filesInput.addEventListener("change", () => {
      const picked = Array.from(filesInput.files);
      filesInput.value = "";
      addAttachmentFiles(picked);
    });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        filesInput.click();
      }
    });
  }

  let programs = [];
  let bySlug = {};
  let programsUnsub = () => {};

  const jsonUrl = new URL(jsonPath, window.location.href).href;
  const moduleUrl = new URL("fahi-programs-data.js", new URL(jsBase, window.location.href).href).href;

  function applyProgramSelectionFromUrl() {
    if (programSlugFromUrl && bySlug[programSlugFromUrl]) {
      select.value = programSlugFromUrl;
    }
  }

  function rebuildPrograms(list) {
    programs = list || [];
    bySlug = Object.fromEntries(programs.map((p) => [p.slug, p]));
    const current = select.value;
    while (select.options.length > 1) {
      select.remove(1);
    }
    programs
      .slice()
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      .forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.slug;
        opt.textContent = p.title;
        select.appendChild(opt);
      });
    if (current && bySlug[current]) {
      select.value = current;
    } else {
      applyProgramSelectionFromUrl();
    }
    syncPrefillNote(prefillNote, bySlug, programSlugFromUrl);
    updateHint();
  }

  let api;
  try {
    api = await import(moduleUrl);
  } catch (e) {
    show(errBox, "Could not load programme data module.");
    return;
  }

  try {
    programsUnsub = await api.subscribeProgramsList(
      jsonUrl,
      ({ programs: plist }) => {
        hide(errBox);
        rebuildPrograms(plist);
      },
      () => {
        show(errBox, "Could not load programmes. Check HTTPS hosting or your connection and try again.");
      }
    );
  } catch (e) {
    try {
      const { programs: list } = await api.fetchProgramsList(jsonUrl);
      rebuildPrograms(list);
    } catch (e2) {
      show(errBox, "Could not load the programme list. Check your connection or use HTTPS hosting.");
      return;
    }
  }

  function updateHint() {
    const slug = select.value;
    const p = bySlug[slug];
    if (!p || !p.entryRequirement) {
      hint.hidden = true;
      hint.innerHTML = "";
      return;
    }
    hint.hidden = false;
    hint.innerHTML = `<strong>Entry requirement for this programme:</strong> ${escapeHtml(p.entryRequirement)}`;
  }

  applyProgramSelectionFromUrl();
  select.addEventListener("change", updateHint);

  window.addEventListener(
    "pagehide",
    () => {
      try {
        programsUnsub();
      } catch (_) {}
    },
    { once: true }
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(errBox);
    hide(okBox);
    hideUploadFeedback();

    const programSlug = select.value.trim();
    const fullName = val("apply-name");
    const email = val("apply-email");
    const phone = val("apply-phone");
    const dateOfBirth = val("apply-dob");
    const gender = val("apply-gender");
    const nationality = val("apply-nationality");
    const nationalIdOrPassport = val("apply-id-number");
    const county = val("apply-county");
    const townOrCity = val("apply-town");
    const postalCode = val("apply-postal");
    const physicalAddress = document.getElementById("apply-address")?.value.trim() ?? "";
    const emergencyContactName = val("apply-emergency-name");
    const emergencyRelationship = val("apply-emergency-rel");
    const emergencyPhone = val("apply-emergency-phone");
    const educationSummary = document.getElementById("apply-education")?.value.trim() ?? "";
    const kcseGradeOrEquivalent = val("apply-kcse");
    const intendedStart = val("apply-intake") || "next";
    const message = document.getElementById("apply-message")?.value.trim() ?? "";
    const paymentMethod = val("apply-payment-method") || "not_yet";
    const mpesaOrTransactionCode = val("apply-tx-code");
    const paymentNotes = document.getElementById("apply-payment-notes")?.value.trim() ?? "";
    const consent = document.getElementById("apply-consent")?.checked;
    const files = attachmentFiles.slice();

    if (!programSlug) {
      show(errBox, "Please choose a programme.");
      return;
    }
    if (!fullName || !email || !phone) {
      show(errBox, "Please fill in your name, email, and phone.");
      return;
    }
    if (!dateOfBirth) {
      show(errBox, "Please enter your date of birth.");
      return;
    }
    if (!gender) {
      show(errBox, "Please select your gender.");
      return;
    }
    if (!county || !townOrCity) {
      show(errBox, "Please enter your county and town or city.");
      return;
    }
    if (!emergencyContactName || !emergencyRelationship || !emergencyPhone) {
      show(errBox, "Please complete all emergency contact fields.");
      return;
    }
    if (!educationSummary) {
      show(errBox, "Please summarise your education and qualifications.");
      return;
    }
    if (!paymentMethod) {
      show(errBox, "Please select a payment status / method.");
      return;
    }
    if (!consent) {
      show(errBox, "Please confirm the declaration before submitting.");
      return;
    }
    if (paymentMethod !== "not_yet" && !mpesaOrTransactionCode) {
      show(errBox, "Please enter your M-Pesa confirmation code, bank reference, or transaction ID for the payment method you selected (or choose “Not paid yet”).");
      return;
    }
    if (files.length > MAX_FILES) {
      show(errBox, `You can upload at most ${MAX_FILES} files.`);
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        show(errBox, `Each file must be under ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
        return;
      }
    }

    if (files.length > 0) {
      const signed = !!getCloudinarySignatureEndpoint();
      const unsigned = !!getCloudinaryUnsignedUploadPreset();
      if (!signed && !unsigned) {
        show(
          errBox,
          "You selected files but uploads are not configured. In apply/index.html set window.__FAHI_CONFIG__.cloudinarySignatureEndpoint to your deployed createCloudinarySignature URL, or set cloudinaryUnsignedPreset for Cloudinary unsigned uploads. You can also clear files and submit without attachments."
        );
        return;
      }
    }

    if (window.location.protocol === "file:") {
      show(errBox, "Applications cannot be submitted from a saved file. Open the site over HTTPS (hosted URL).");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");

    try {
      await initFirebaseApp();
      const auth = getAuthInstance();
      const db = getDb();
      const cred = await signInAnonymously(auth);
      const uid = cred.user.uid;

      const attachmentMeta = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploaded = await uploadToCloudinarySigned(file, {
          folder: `fahi/applications/${uid}`,
        });
        attachmentMeta.push({
          ...uploaded,
          safeName: safeFileName(file.name),
          uploadedAt: new Date().toISOString(),
        });
      }

      const programTitle = bySlug[programSlug]?.title || programSlug;

      const doc = omitUndefined({
        applicantUid: uid,
        programSlug,
        programTitle,
        programPrefilledFromUrl: !!(programSlugFromUrl && programSlugFromUrl === programSlug),

        fullName,
        email,
        phone,
        dateOfBirth,
        gender,
        nationality,
        nationalIdOrPassport,

        county,
        townOrCity,
        postalCode,
        physicalAddress,

        emergencyContactName,
        emergencyRelationship,
        emergencyPhone,

        educationSummary,
        kcseGradeOrEquivalent,
        intendedStart,
        message,

        paymentMethod,
        mpesaOrTransactionCode,
        paymentNotes,

        attachments: attachmentMeta,
        attachmentCount: attachmentMeta.length,

        createdAt: serverTimestamp(),
        source: "public-web-form",
        submittedFromPath: typeof window !== "undefined" ? window.location.pathname : "",
      });

      await addDoc(collection(db, "applications"), doc);

      show(okBox, "Thank you — your application was submitted. We will contact you soon.");
      form.reset();
      attachmentFiles.length = 0;
      syncAttachmentInput();
      renderAttachmentList();
      hideUploadFeedback();
      applyProgramSelectionFromUrl();
      syncPrefillNote(prefillNote, bySlug, programSlugFromUrl);
      updateHint();
    } catch (err) {
      console.error(err);
      const code = err && err.code ? String(err.code) : "";
      const rawMsg = err && err.message ? String(err.message) : "";

      let userMsg = "We could not submit your application. Please try again.";
      if (
        rawMsg.includes("Cloudinary") ||
        rawMsg.includes("upload path") ||
        rawMsg.includes("signature endpoint")
      ) {
        userMsg = rawMsg;
      } else if (code === "permission-denied") {
        userMsg =
          "We could not submit your application due to a site configuration issue. Please try again later or contact FAHI.";
      } else if (code === "auth/unauthorized-domain") {
        userMsg =
          "This form cannot complete sign-in from this web address. Open the page from the main FAHI website link you were given.";
      } else if (code === "auth/operation-not-allowed") {
        userMsg = "Sign-in for applications is not available on this site yet. Please contact FAHI.";
      } else if (code === "auth/network-request-failed") {
        userMsg = "Network error — check your connection and try again.";
      } else if (rawMsg) {
        userMsg = rawMsg;
      }

      show(errBox, userMsg);
    } finally {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
    }
  });
}

init();
