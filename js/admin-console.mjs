/**
 * FAHI staff portal — /admin/
 * Shell (sidebar + top bar) and realtime Firestore listeners for catalogue data.
 */
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initFirebaseApp, getDb, getAuthInstance } from "./fahi-firebase.js";

function $(id) {
  return document.getElementById(id);
}

function show(el, text, kind) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.remove("admin-msg--ok", "admin-msg--err");
  if (kind === "ok") el.classList.add("admin-msg--ok");
  if (kind === "err") el.classList.add("admin-msg--err");
}

function hide(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

/** User-facing sign-in errors (Firebase Auth codes). */
function friendlyAuthError(err) {
  const code = err && err.code ? String(err.code) : "";
  const raw = err && err.message ? String(err.message) : "";
  switch (code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a few minutes.";
    case "auth/network-request-failed":
      return "Network error — check your connection.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this project.";
    default:
      return raw || "Sign-in failed.";
  }
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setSidebarCount(sidebarCountId, text) {
  setText(sidebarCountId, text);
}

function initialsFromEmail(email) {
  if (!email || typeof email !== "string") return "?";
  const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

function closeAllDropdowns() {
  document.querySelectorAll(".admin-dropdown__panel.is-open").forEach((p) => p.classList.remove("is-open"));
}

const MODULE_TITLES = {
  dashboard: "Overview",
  programs: "Programmes",
  team: "About team",
  careers: "Careers",
  homepage: "Homepage & marketing",
  "lease-equipment": "Lease equipment",
  "inbox-careers": "Career applications",
  "inbox-homecare": "Home care bookings",
  "inbox-lease": "Equipment lease requests",
  "inbox-contact": "Contact enquiries",
  "inbox-pathways": "Pathways enquiries",
  "inbox-apply": "Apply submissions",
};

function initShellNav() {
  const sidebarNav = document.querySelectorAll(".admin-sidebar [data-admin-nav]");
  const triggers = document.querySelectorAll("[data-admin-nav]");
  const modules = document.querySelectorAll("[data-admin-module]");
  const pageLabel = $("admin-topbar-page-label");

  function activate(key) {
    sidebarNav.forEach((btn) => {
      const k = btn.getAttribute("data-admin-nav");
      btn.classList.toggle("is-active", k === key);
      btn.setAttribute("aria-current", k === key ? "page" : "false");
    });
    modules.forEach((mod) => {
      mod.classList.toggle("is-active", mod.getAttribute("data-admin-module") === key);
    });
    if (pageLabel) pageLabel.textContent = MODULE_TITLES[key] || key;
  }

  triggers.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-admin-nav");
      if (key) {
        closeAllDropdowns();
        activate(key);
        if (isMobileAdminNav()) closeMobileAdminSidebar();
      }
    });
  });

  const initial = document.querySelector(".admin-sidebar [data-admin-nav].is-active");
  if (initial) activate(initial.getAttribute("data-admin-nav") || "dashboard");
}

function initTopBarDropdowns() {
  const profileTrigger = $("admin-profile-trigger");
  const profileDrop = $("admin-profile-dropdown");
  const notifyTrigger = $("admin-notify-trigger");
  const notifyDrop = $("admin-notify-dropdown");

  profileTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !profileDrop?.classList.contains("is-open");
    closeAllDropdowns();
    if (willOpen) profileDrop?.classList.add("is-open");
    profileTrigger.setAttribute(
      "aria-expanded",
      profileDrop?.classList.contains("is-open") ? "true" : "false"
    );
    notifyTrigger?.setAttribute("aria-expanded", "false");
  });

  notifyTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !notifyDrop?.classList.contains("is-open");
    closeAllDropdowns();
    if (willOpen) notifyDrop?.classList.add("is-open");
    notifyTrigger.setAttribute("aria-expanded", notifyDrop?.classList.contains("is-open") ? "true" : "false");
    profileTrigger?.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("click", () => {
    closeAllDropdowns();
    profileTrigger?.setAttribute("aria-expanded", "false");
    notifyTrigger?.setAttribute("aria-expanded", "false");
  });

  profileDrop?.addEventListener("click", (e) => e.stopPropagation());
  notifyDrop?.addEventListener("click", (e) => e.stopPropagation());
}

const SIDEBAR_COLLAPSE_KEY = "fahi-admin-sidebar-collapsed";
const mqMobileNav = window.matchMedia("(max-width: 900px)");

function isMobileAdminNav() {
  return mqMobileNav.matches;
}

function closeMobileAdminSidebar() {
  const shell = $("admin-shell");
  const btn = $("admin-sidebar-toggle");
  const backdrop = $("admin-sidebar-backdrop");
  if (!shell) return;
  shell.classList.remove("admin-sidebar-open");
  document.body.classList.remove("admin-nav-open");
  backdrop?.setAttribute("hidden", "");
  backdrop?.setAttribute("aria-hidden", "true");
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Open menu");
    btn.title = "Open menu";
    const icon = btn.querySelector("i");
    if (icon) icon.className = "fa-solid fa-bars";
  }
}

function openMobileAdminSidebar() {
  const shell = $("admin-shell");
  const btn = $("admin-sidebar-toggle");
  const backdrop = $("admin-sidebar-backdrop");
  if (!shell) return;
  closeAllDropdowns();
  shell.classList.add("admin-sidebar-open");
  document.body.classList.add("admin-nav-open");
  backdrop?.removeAttribute("hidden");
  backdrop?.setAttribute("aria-hidden", "false");
  if (btn) {
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "Close menu");
    btn.title = "Close menu";
    const icon = btn.querySelector("i");
    if (icon) icon.className = "fa-solid fa-xmark";
  }
}

function applyDesktopSidebarCollapse(collapsed) {
  const shell = $("admin-shell");
  const btn = $("admin-sidebar-toggle");
  if (!shell || !btn) return;
  shell.classList.remove("admin-sidebar-open");
  shell.classList.toggle("admin-sidebar-collapsed", collapsed);
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  btn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  btn.title = collapsed ? "Expand menu" : "Collapse menu";
  const icon = btn.querySelector("i");
  if (icon) {
    icon.className = collapsed ? "fa-solid fa-angles-right" : "fa-solid fa-angles-left";
  }
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
}

function initSidebarToggle() {
  const shell = $("admin-shell");
  const btn = $("admin-sidebar-toggle");
  const backdrop = $("admin-sidebar-backdrop");
  if (!shell || !btn) return;

  const syncNavMode = () => {
    if (isMobileAdminNav()) {
      shell.classList.remove("admin-sidebar-collapsed");
      closeMobileAdminSidebar();
    } else {
      closeMobileAdminSidebar();
      let startCollapsed = false;
      try {
        startCollapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
      } catch (_) {
        /* ignore */
      }
      applyDesktopSidebarCollapse(startCollapsed);
    }
  };

  syncNavMode();
  mqMobileNav.addEventListener("change", syncNavMode);

  btn.addEventListener("click", () => {
    if (isMobileAdminNav()) {
      if (shell.classList.contains("admin-sidebar-open")) closeMobileAdminSidebar();
      else openMobileAdminSidebar();
      return;
    }
    applyDesktopSidebarCollapse(!shell.classList.contains("admin-sidebar-collapsed"));
  });

  backdrop?.addEventListener("click", () => closeMobileAdminSidebar());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shell.classList.contains("admin-sidebar-open")) {
      closeMobileAdminSidebar();
    }
  });
}

function initNavTooltips() {
  document.querySelectorAll(".admin-nav__btn[data-admin-nav]").forEach((btn) => {
    const lab = btn.querySelector(".admin-nav__label");
    if (lab) btn.title = lab.textContent.trim();
  });
}

/** Subscribes to public-readable collections to drive sidebar counts (realtime). */
function startSidebarRealtime(db) {
  const unsubs = [];
  const ready = { programs: false, team: false, careers: false, site: false };

  const dot = $("admin-live-dot");
  const wrap = $("admin-live-wrap");

  function setLiveStatus(message) {
    if (!wrap) return;
    if (message) {
      wrap.setAttribute("aria-label", message);
      wrap.title = message;
    } else {
      wrap.removeAttribute("aria-label");
      wrap.removeAttribute("title");
    }
  }

  function refreshLiveIndicator() {
    if (!dot || !wrap) return;
    const n = Object.values(ready).filter(Boolean).length;
    if (n >= 4) {
      dot.classList.add("admin-live-dot--on");
      setLiveStatus("All catalogue feeds are active");
    } else {
      dot.classList.remove("admin-live-dot--on");
      setLiveStatus(n > 0 ? "Loading catalogue feeds" : "Waiting for catalogue feeds");
    }
  }

  function touch(key) {
    if (!ready[key]) {
      ready[key] = true;
      refreshLiveIndicator();
    }
  }

  unsubs.push(
    onSnapshot(
      collection(db, "programs"),
      (snap) => {
        setSidebarCount("admin-count-programs", String(snap.size));
        touch("programs");
      },
      () => setSidebarCount("admin-count-programs", "—")
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "aboutTeamMembers"),
      (snap) => {
        setSidebarCount("admin-count-team", String(snap.size));
        touch("team");
      },
      () => setSidebarCount("admin-count-team", "—")
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "careers"),
      (snap) => {
        setSidebarCount("admin-count-careers", String(snap.size));
        touch("careers");
      },
      () => setSidebarCount("admin-count-careers", "—")
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, "site", "public"),
      (snap) => {
        const v = snap.exists() ? "OK" : "—";
        setSidebarCount("admin-count-site", v);
        touch("site");
      },
      () => setSidebarCount("admin-count-site", "—")
    )
  );

  refreshLiveIndicator();

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch (_) {
        /* ignore */
      }
    });
    Object.keys(ready).forEach((k) => {
      ready[k] = false;
    });
    if (dot) dot.classList.remove("admin-live-dot--on");
    setLiveStatus("");
  };
}

async function boot() {
  const loginStage = $("admin-login-stage");
  const loginForm = $("admin-login-form");
  const app = $("admin-app");
  const emailEl = $("admin-email");
  const passEl = $("admin-password");
  const loginMsg = $("admin-login-msg");
  const signInBtn = $("admin-sign-in");
  const signOutBtn = $("admin-sign-out");
  const profileEmail = $("admin-profile-email");
  const profileInitial = $("admin-profile-initial");

  let stopRealtime = () => {};

  initShellNav();
  initTopBarDropdowns();
  initSidebarToggle();
  initNavTooltips();

  async function attemptSignIn() {
    hide(loginMsg);
    const email = (emailEl.value || "").trim();
    const password = passEl.value || "";
    if (!email || !password) {
      show(loginMsg, "Enter email and password.", "err");
      return;
    }
    if (signInBtn) signInBtn.disabled = true;
    try {
      await initFirebaseApp();
      const auth = getAuthInstance();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      show(loginMsg, friendlyAuthError(e), "err");
    } finally {
      if (signInBtn) signInBtn.disabled = false;
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      void attemptSignIn();
    });
  }

  signOutBtn?.addEventListener("click", async () => {
    try {
      const auth = getAuthInstance();
      await signOut(auth);
    } catch (_) {
      /* ignore */
    }
    closeAllDropdowns();
  });

  await initFirebaseApp();
  const auth = getAuthInstance();
  onAuthStateChanged(auth, (user) => {
    stopRealtime();
    stopRealtime = () => {};

    if (user) {
      if (loginStage) loginStage.classList.add("admin-hidden");
      app.classList.remove("admin-hidden");
      const em = user.email || user.uid;
      if (profileEmail) profileEmail.textContent = em;
      if (profileInitial) profileInitial.textContent = initialsFromEmail(user.email || "");

      void (async () => {
        try {
          await initFirebaseApp();
          const db = getDb();
          stopRealtime = startSidebarRealtime(db);
        } catch (e) {
          console.warn(e);
          const wrap = $("admin-live-wrap");
          if (wrap) {
            wrap.setAttribute("aria-label", "Could not connect to catalogue feeds");
            wrap.title = "Could not connect";
          }
        }
      })();
    } else {
      app.classList.add("admin-hidden");
      if (loginStage) loginStage.classList.remove("admin-hidden");
      if (profileEmail) profileEmail.textContent = "";
      if (profileInitial) profileInitial.textContent = "";
      hide(loginMsg);
      if (passEl) passEl.value = "";
      if (emailEl) queueMicrotask(() => emailEl.focus());

      setSidebarCount("admin-count-programs", "—");
      setSidebarCount("admin-count-team", "—");
      setSidebarCount("admin-count-careers", "—");
      setSidebarCount("admin-count-site", "—");
      const dot = $("admin-live-dot");
      const wrap = $("admin-live-wrap");
      if (dot) dot.classList.remove("admin-live-dot--on");
      if (wrap) {
        wrap.removeAttribute("aria-label");
        wrap.removeAttribute("title");
      }
    }
  });
}

boot().catch((e) => {
  console.error(e);
  const loginMsg = $("admin-login-msg");
  if (loginMsg) {
    loginMsg.hidden = false;
    loginMsg.textContent = "Could not start admin tools.";
    loginMsg.classList.add("admin-msg--err");
  }
});
