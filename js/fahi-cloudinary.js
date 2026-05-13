/**
 * Cloudinary delivery URLs — CDN caching + optional version segment for bust when you replace an asset.
 * In the CMS set: heroImagePublicId ("folder/my-hero"), optional heroImageVersion (epoch from Cloudinary).
 */
import { getCloudinaryCloudName } from "./fahi-config.js";

/**
 * @param {string} publicId
 * @param {{ width?: number, height?: number, crop?: string, version?: number|string }} opts
 */
export function cloudinaryImageUrl(publicId, opts = {}) {
  const cloud = getCloudinaryCloudName();
  if (!cloud || !publicId) return "";
  const w = opts.width ?? 1200;
  const h = opts.height ?? 900;
  const crop = opts.crop || "fill";
  const v =
    opts.version != null && opts.version !== ""
      ? `v${String(opts.version).replace(/^v/, "")}/`
      : "";
  const transforms = `f_auto,q_auto,fl_progressive,c_${crop},w_${w},h_${h}`;
  const id = String(publicId).replace(/^\/+/, "");
  return `https://res.cloudinary.com/${cloud}/image/upload/${v}${transforms}/${id}`;
}

/** Normalize programme object for UI: Cloudinary public id wins over raw URL when cloud is configured */
export function normalizeProgramMedia(p) {
  if (!p || typeof p !== "object") return p;
  const out = { ...p };
  const cloud = getCloudinaryCloudName();
  if (cloud && out.heroImagePublicId) {
    const url = cloudinaryImageUrl(out.heroImagePublicId, {
      width: 1200,
      height: 900,
      version: out.heroImageVersion,
    });
    if (url) out.heroImage = url;
  }
  return out;
}

/**
 * About-page team headshot: prefer Cloudinary public id (with transforms) when configured.
 * @param {{ imagePublicId?: string, imageVersion?: number, imageUrl?: string }} row
 * @param {(raw: string) => string} resolveFallbackUrl site-relative or absolute imageUrl → absolute URL
 */
export function resolveTeamMemberImageUrl(row, resolveFallbackUrl) {
  if (!row || typeof row !== "object") return "";
  const cloud = getCloudinaryCloudName();
  const pid = String(row.imagePublicId || "").trim();
  if (cloud && pid) {
    const ver = row.imageVersion;
    const version =
      ver != null && ver !== "" && Number(ver) > 0 ? (typeof ver === "number" ? ver : Number(ver)) : undefined;
    const url = cloudinaryImageUrl(pid, {
      width: 720,
      height: 640,
      crop: "fill",
      version,
    });
    if (url) return url;
  }
  return typeof resolveFallbackUrl === "function" ? resolveFallbackUrl(String(row.imageUrl || "").trim()) : "";
}
