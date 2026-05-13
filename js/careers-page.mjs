/**
 * FAHI /careers/ — live listings, search/filters, role preview, résumé upload (Cloudinary), applications.
 */
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadToCloudinarySigned } from "./cloudinary-upload.js";
import {
  getCloudinaryCloudName,
  getCloudinarySignatureEndpoint,
  getCloudinaryUnsignedUploadPreset,
} from "./fahi-config.js";
import { initFirebaseApp, getAuthInstance, getDb } from "./fahi-firebase.js";

const RESUME_MAX_BYTES = 15 * 1024 * 1024;

function esc(s) {
  if (s == null || s === "") return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function sortCareers(rows) {
  return rows.slice().sort((a, b) => {
    const oa = a.sortOrder != null ? Number(a.sortOrder) : 9999;
    const ob = b.sortOrder != null ? Number(b.sortOrder) : 9999;
    if (oa !== ob) return oa - ob;
    return String(a.title || a.id || "").localeCompare(String(b.title || b.id || ""));
  });
}

function isListedCareer(row) {
  return row && row.active !== false;
}

function rowHaystack(row) {
  return [
    row.id,
    row.title,
    row.summary,
    row.description,
    row.department,
    row.location,
    row.employmentType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterCareerRows(rows, searchRaw, deptRaw) {
  const q = String(searchRaw || "")
    .trim()
    .toLowerCase();
  const dept = String(deptRaw || "").trim().toLowerCase();
  let out = rows.filter(isListedCareer);
  if (dept) {
    out = out.filter((r) => String(r.department || "").trim().toLowerCase() === dept);
  }
  if (q) {
    out = out.filter((r) => rowHaystack(r).includes(q));
  }
  return sortCareers(out);
}

function uniqueDepartments(rows) {
  const set = new Set();
  for (const r of rows.filter(isListedCareer)) {
    const d = String(r.department || "").trim();
    if (d) set.add(d);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function renderCards(mount, rows) {
  if (!mount) return;
  if (!rows.length) {
    mount.innerHTML = "";
    return;
  }
  mount.innerHTML = rows
    .map((row) => {
      const id = esc(row.id);
      const title = esc(row.title || row.id);
      const summary = esc(row.summary || "");
      const dept = esc(row.department || "");
      const loc = esc(row.location || "");
      const type = esc(row.employmentType || "");
      const meta = [dept, loc, type].filter(Boolean).join(" · ");
      const applyHref = `?position=${encodeURIComponent(row.id)}#apply`;
      return `
        <article class="careers-card">
          <div class="careers-card__meta">${esc(meta)}</div>
          <h3 class="careers-card__title">${title}</h3>
          <p class="careers-card__summary">${summary}</p>
          <a class="careers-card__link" href="${applyHref}">Apply for this role →</a>
        </article>`;
    })
    .join("");
}

function fillDeptFilter(selectEl, rows, preserveValue) {
  if (!selectEl) return;
  const prev = preserveValue != null ? preserveValue : selectEl.value;
  const depts = uniqueDepartments(rows);
  selectEl.innerHTML = '<option value="">All departments</option>';
  for (const d of depts) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    selectEl.appendChild(opt);
  }
  if (prev && depts.some((d) => d === prev)) selectEl.value = prev;
}

function fillApplySelect(selectEl, rows) {
  if (!selectEl) return;
  const publicRows = sortCareers(rows.filter(isListedCareer));
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Choose a role…</option>';
  for (const row of publicRows) {
    const opt = document.createElement("option");
    opt.value = row.id;
    opt.textContent = row.title || row.id;
    selectEl.appendChild(opt);
  }
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("position");
  if (fromQuery && publicRows.some((r) => r.id === fromQuery)) {
    selectEl.value = fromQuery;
  } else if (current && publicRows.some((r) => r.id === current)) {
    selectEl.value = current;
  }
}

function updatePositionPreview(rows, slug, emptyEl, bodyEl) {
  if (!emptyEl || !bodyEl) return;
  if (!slug) {
    emptyEl.hidden = false;
    bodyEl.hidden = true;
    bodyEl.innerHTML = "";
    return;
  }
  const row = rows.find((r) => r.id === slug && isListedCareer(r));
  if (!row) {
    emptyEl.hidden = false;
    bodyEl.hidden = true;
    bodyEl.innerHTML = "";
    return;
  }
  emptyEl.hidden = true;
  bodyEl.hidden = false;
  const meta = [row.department, row.location, row.employmentType].filter(Boolean).join(" · ");
  const desc = (row.description || "").trim();
  bodyEl.innerHTML = `
    <p class="careers-preview__eyebrow">Selected role</p>
    <h3 class="careers-preview__title">${esc(row.title || row.id)}</h3>
    <p class="careers-preview__meta">${esc(meta)}</p>
    <div class="careers-preview__divider"></div>
    <h4 class="careers-preview__sub">Summary</h4>
    <p class="careers-preview__text">${esc(row.summary || "—")}</p>
    <h4 class="careers-preview__sub">Full description</h4>
    <div class="careers-preview__desc">${esc(desc)}</div>
  `;
}

function setFormMsg(el, text, kind) {
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
  el.classList.remove("careers-msg--ok", "careers-msg--err");
  if (kind === "ok") el.classList.add("careers-msg--ok");
  if (kind === "err") el.classList.add("careers-msg--err");
}

function clearResumeState(resumeUrlEl, resumeNameEl, resumeFileInput, resumeLinkInput, dropzoneLabel, uploadStatus) {
  if (resumeUrlEl) resumeUrlEl.value = "";
  if (resumeNameEl) resumeNameEl.value = "";
  if (resumeFileInput) resumeFileInput.value = "";
  if (resumeLinkInput) resumeLinkInput.value = "";
  if (dropzoneLabel) {
    dropzoneLabel.innerHTML =
      '<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Drop résumé here or click to upload';
  }
  if (uploadStatus) {
    uploadStatus.textContent = "";
    uploadStatus.classList.remove("careers-dropzone__status--err");
  }
}

async function uploadResumeFile(file, uploadStatusEl) {
  if (!(file instanceof File)) return;
  if (file.size > RESUME_MAX_BYTES) {
    throw new Error("File is too large (max 15 MB).");
  }
  if (!getCloudinaryCloudName()) {
    throw new Error("Uploads are not configured (Cloudinary cloud name).");
  }
  const canUnsigned = !!getCloudinaryUnsignedUploadPreset();
  const canSigned = !!getCloudinarySignatureEndpoint();
  if (!canUnsigned && !canSigned) {
    throw new Error("Configure Cloudinary uploads on this site (preset or signature endpoint).");
  }
  if (uploadStatusEl) {
    uploadStatusEl.textContent = "Uploading…";
    uploadStatusEl.classList.remove("careers-dropzone__status--err");
  }
  const result = await uploadToCloudinarySigned(file, { folder: "fahi/careers-resumes" });
  if (uploadStatusEl) {
    uploadStatusEl.textContent = `Uploaded: ${file.name}`;
    uploadStatusEl.classList.remove("careers-dropzone__status--err");
  }
  return { secureUrl: result.secureUrl || "", fileName: file.name || "resume" };
}

async function boot() {
  const mount = document.getElementById("careers-list-mount");
  const statusEl = document.getElementById("careers-list-status");
  const toolbarEl = document.getElementById("careers-toolbar");
  const searchEl = document.getElementById("careers-filter-search");
  const deptEl = document.getElementById("careers-filter-dept");
  const selectEl = document.getElementById("career-apply-slug");
  const form = document.getElementById("career-application-form");
  const msgEl = document.getElementById("career-form-msg");
  const previewEmpty = document.getElementById("career-preview-empty");
  const previewBody = document.getElementById("career-preview-body");
  const dropzone = document.getElementById("career-resume-dropzone");
  const resumeFileInput = document.getElementById("career-resume-file");
  const resumeUrlHidden = document.getElementById("career-resume-url");
  const resumeNameHidden = document.getElementById("career-resume-filename");
  const dropzoneLabel = document.getElementById("career-resume-dropzone-label");
  const uploadStatus = document.getElementById("career-resume-upload-status");
  const resumeLinkInput = document.getElementById("career-apply-resume-link");

  let rows = [];

  const syncUi = () => {
    const deptPreserve = deptEl ? deptEl.value : "";
    fillDeptFilter(deptEl, rows, deptPreserve);
    const allActive = sortCareers(rows.filter(isListedCareer));
    if (toolbarEl) toolbarEl.hidden = allActive.length === 0;

    const search = searchEl ? searchEl.value : "";
    const dept = deptEl ? deptEl.value : "";
    const filtered = filterCareerRows(rows, search, dept);

    if (statusEl) {
      if (!allActive.length) {
        statusEl.textContent = "No open roles right now. Check back soon.";
        statusEl.classList.remove("careers-status--err", "careers-status--filter");
      } else if (!filtered.length) {
        statusEl.textContent = "No roles match your search or department filter.";
        statusEl.classList.add("careers-status--filter");
        statusEl.classList.remove("careers-status--err");
      } else {
        statusEl.textContent = "";
        statusEl.classList.remove("careers-status--err", "careers-status--filter");
      }
    }

    renderCards(mount, filtered);
    fillApplySelect(selectEl, rows);
    if (selectEl) {
      updatePositionPreview(rows, selectEl.value, previewEmpty, previewBody);
    }
  };

  const onSelectChange = () => {
    if (selectEl) updatePositionPreview(rows, selectEl.value, previewEmpty, previewBody);
  };

  if (statusEl) {
    statusEl.textContent = "Loading openings…";
  }

  try {
    await initFirebaseApp();
    const db = getDb();
    onSnapshot(
      collection(db, "careers"),
      (snap) => {
        rows = [];
        snap.forEach((d) => {
          rows.push({ id: d.id, ...(d.data() || {}) });
        });
        if (statusEl) {
          statusEl.classList.remove("careers-status--err");
        }
        syncUi();
      },
      (err) => {
        console.warn(err);
        if (statusEl) {
          statusEl.textContent =
            "Could not load careers (check your connection or try again later). You can still browse the site.";
          statusEl.classList.add("careers-status--err");
          statusEl.classList.remove("careers-status--filter");
        }
        if (mount) mount.innerHTML = "";
        if (toolbarEl) toolbarEl.hidden = true;
      }
    );
  } catch (e) {
    console.warn(e);
    if (statusEl) {
      statusEl.textContent = "Careers could not be loaded on this device.";
      statusEl.classList.add("careers-status--err");
    }
  }

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      syncUi();
    });
  }
  if (deptEl) {
    deptEl.addEventListener("change", () => {
      syncUi();
    });
  }
  if (selectEl) {
    selectEl.addEventListener("change", onSelectChange);
  }

  if (resumeLinkInput) {
    resumeLinkInput.addEventListener("input", () => {
      if (resumeLinkInput.value.trim()) {
        if (resumeUrlHidden) resumeUrlHidden.value = "";
        if (resumeNameHidden) resumeNameHidden.value = "";
        if (resumeFileInput) resumeFileInput.value = "";
        if (uploadStatus) {
          uploadStatus.textContent = "";
          uploadStatus.classList.remove("careers-dropzone__status--err");
        }
        if (dropzoneLabel) {
          dropzoneLabel.innerHTML =
            '<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Drop résumé here or click to upload';
        }
      }
    });
  }

  async function handleResumeFile(file) {
    if (!file) return;
    try {
      const { secureUrl, fileName } = await uploadResumeFile(file, uploadStatus);
      if (resumeUrlHidden) resumeUrlHidden.value = secureUrl.slice(0, 1500);
      if (resumeNameHidden) resumeNameHidden.value = fileName.slice(0, 200);
      if (resumeLinkInput) resumeLinkInput.value = "";
    } catch (err) {
      console.error(err);
      if (uploadStatus) {
        uploadStatus.textContent = err && err.message ? err.message : "Upload failed.";
        uploadStatus.classList.add("careers-dropzone__status--err");
      }
      clearResumeState(resumeUrlHidden, resumeNameHidden, resumeFileInput, resumeLinkInput, dropzoneLabel, null);
    }
  }

  if (dropzone && resumeFileInput) {
    dropzone.addEventListener("click", () => {
      resumeFileInput.click();
    });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        resumeFileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("careers-dropzone--active");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("careers-dropzone--active");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      void handleResumeFile(f);
    });
    resumeFileInput.addEventListener("change", () => {
      const f = resumeFileInput.files && resumeFileInput.files[0];
      void handleResumeFile(f);
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setFormMsg(msgEl, "", null);

    const slug = (selectEl && selectEl.value ? selectEl.value : "").trim();
    const fd = new FormData(form);
    const fullName = String(fd.get("fullName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const coverLetter = String(fd.get("coverLetter") || "").trim();
    const uploadedUrl = resumeUrlHidden ? String(resumeUrlHidden.value || "").trim() : "";
    const pastedLink = resumeLinkInput ? String(resumeLinkInput.value || "").trim() : "";
    const resumeUrl = (uploadedUrl || pastedLink).slice(0, 1500);
    let resumeFileName = resumeNameHidden ? String(resumeNameHidden.value || "").trim().slice(0, 200) : "";
    if (!resumeFileName && pastedLink) resumeFileName = "Pasted link";
    if (!resumeFileName && resumeUrl) resumeFileName = "Uploaded file";

    if (!slug) {
      setFormMsg(msgEl, "Please choose a position.", "err");
      return;
    }
    if (!fullName || !email || !phone || !coverLetter) {
      setFormMsg(msgEl, "Please complete name, email, phone, and cover letter.", "err");
      return;
    }

    const careerRow = rows.find((r) => r.id === slug);
    const careerTitle = (careerRow && careerRow.title) || slug;

    if (window.location.protocol === "file:") {
      setFormMsg(
        msgEl,
        "Open this page over HTTPS (hosted site or local server), not file://, to submit applications.",
        "err"
      );
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }

    try {
      await initFirebaseApp();
      const auth = getAuthInstance();
      const db = getDb();
      const cred = await signInAnonymously(auth);

      await addDoc(collection(db, "careerApplications"), {
        careerSlug: slug,
        careerTitle: String(careerTitle).slice(0, 220),
        fullName: fullName.slice(0, 200),
        email: email.slice(0, 320),
        phone: phone.slice(0, 80),
        coverLetter: coverLetter.slice(0, 8000),
        resumeUrl,
        resumeFileName,
        source: "careers-page",
        submittedFromPath: window.location.pathname + window.location.search,
        submittedAt: serverTimestamp(),
        submitterUid: cred.user.uid,
      });

      setFormMsg(msgEl, "Thank you — your application was submitted successfully.", "ok");
      form.reset();
      clearResumeState(resumeUrlHidden, resumeNameHidden, resumeFileInput, resumeLinkInput, dropzoneLabel, uploadStatus);
      fillApplySelect(selectEl, rows);
      onSelectChange();
      const url = new URL(window.location.href);
      if (url.searchParams.has("position")) {
        url.searchParams.delete("position");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch (err) {
      console.error(err);
      const code = err && err.code ? String(err.code) : "";
      let text = "Could not submit right now. Please try again shortly.";
      if (code === "permission-denied") {
        text =
          "We could not submit your application due to a site configuration issue. Please try again later or contact FAHI.";
      } else if (code === "auth/operation-not-allowed") {
        text = "Sign-in for applications is not available on this site yet. Please contact FAHI.";
      } else if (code === "auth/unauthorized-domain") {
        text =
          "This form cannot complete sign-in from this web address. Open the page from the main FAHI website link you were given.";
      } else if (code === "auth/network-request-failed") {
        text = "Network error — check your connection.";
      }
      setFormMsg(msgEl, text, "err");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
      }
    }
  });

  const url = new URL(window.location.href);
  if (url.hash === "#apply" && url.searchParams.get("position")) {
    requestAnimationFrame(() => {
      const el = document.getElementById("apply");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

boot();
