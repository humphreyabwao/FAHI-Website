/**
 * FAHI runtime config — override before any module loads:
 *   <script>window.__FAHI_CONFIG__ = { firebase: {...}, cloudinaryCloudName: "your-cloud", cloudinarySignatureEndpoint: "https://..." };</script>
 * Defaults below are for the FAHI web app; restrict keys in your project’s auth settings (authorized domains / API restrictions).
 */

export function getFirebaseConfig() {
  const w = typeof window !== "undefined" ? window : {};
  if (w.__FAHI_CONFIG__ && w.__FAHI_CONFIG__.firebase) {
    return w.__FAHI_CONFIG__.firebase;
  }
  return {
    apiKey: "AIzaSyDQ7n0FjrpcMooCnmEzaOt72KGHM8sJulA",
    authDomain: "fahi-fba7b.firebaseapp.com",
    projectId: "fahi-fba7b",
    storageBucket: "fahi-fba7b.firebasestorage.app",
    messagingSenderId: "466475663939",
    appId: "1:466475663939:web:c0ae4ce59c0c94a7948af6",
    measurementId: "G-Q6RPP2L6MG",
  };
}

/** Cloudinary cloud name (e.g. "demo") — empty = use direct heroImage URLs only */
export function getCloudinaryCloudName() {
  const w = typeof window !== "undefined" ? window : {};
  const c = w.__FAHI_CONFIG__ && w.__FAHI_CONFIG__.cloudinaryCloudName;
  return (c && String(c).trim()) || "dhhoou5mw";
}

/** Signed upload endpoint hosted by your backend/Cloud Function */
export function getCloudinarySignatureEndpoint() {
  const w = typeof window !== "undefined" ? window : {};
  const e = w.__FAHI_CONFIG__ && w.__FAHI_CONFIG__.cloudinarySignatureEndpoint;
  return (e && String(e).trim()) || "";
}

/**
 * Optional unsigned upload preset (Cloudinary Console → Upload → Upload presets).
 * Use for staging/dev when createCloudinarySignature is not deployed yet.
 * Do not enable “unsigned” on a preset that points at production folders unless you accept public uploads.
 */
export function getCloudinaryUnsignedUploadPreset() {
  const w = typeof window !== "undefined" ? window : {};
  const p = w.__FAHI_CONFIG__ && w.__FAHI_CONFIG__.cloudinaryUnsignedPreset;
  return (p && String(p).trim()) || "";
}
