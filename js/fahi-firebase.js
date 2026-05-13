/**
 * FAHI app bootstrap — hosted database client (+ Analytics when supported)
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import { getFirebaseConfig } from "./fahi-config.js";

const FB_VERSION = "10.14.1";

let app;
let db;
let auth;
let storage;
let initPromise;

export function getFirebaseSdkVersion() {
  return FB_VERSION;
}

export async function initFirebaseApp() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cfg = getFirebaseConfig();
    if (!getApps().length) {
      app = initializeApp(cfg);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    try {
      await enableIndexedDbPersistence(db);
    } catch (e) {
      if (e && e.code !== "failed-precondition" && e.code !== "unimplemented") {
        console.warn("[FAHI] Offline persistence:", e);
      }
    }
    auth = getAuth(app);
    storage = getStorage(app);
    if (typeof window !== "undefined" && (await isSupported())) {
      try {
        getAnalytics(app);
      } catch (_) {
        /* ignore analytics init failures (blocked cookies, etc.) */
      }
    }
    return app;
  })();
  return initPromise;
}

export function getDb() {
  if (!db) throw new Error("FAHI: Database not initialized — call initFirebaseApp() first");
  return db;
}

export function getAuthInstance() {
  if (!auth) throw new Error("FAHI: Auth not initialized — call initFirebaseApp() first");
  return auth;
}

export function getStorageInstance() {
  if (!storage) throw new Error("FAHI: Storage not initialized — call initFirebaseApp() first");
  return storage;
}
