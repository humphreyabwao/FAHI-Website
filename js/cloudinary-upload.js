import {
  getCloudinaryCloudName,
  getCloudinarySignatureEndpoint,
  getCloudinaryUnsignedUploadPreset,
} from "./fahi-config.js";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function mapCloudinaryUploadBody(uploadBody, file) {
  const ver = uploadBody.version;
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    publicId: uploadBody.public_id || "",
    version: ver != null && ver !== "" ? Number(ver) || 0 : 0,
    secureUrl: uploadBody.secure_url || "",
    bytes: uploadBody.bytes || file.size,
    format: uploadBody.format || "",
    resourceType: uploadBody.resource_type || "raw",
  };
}

export async function uploadToCloudinarySigned(file, opts = {}) {
  if (!(file instanceof File)) {
    throw new Error("Expected a File upload.");
  }

  const cloudName = getCloudinaryCloudName();
  const unsignedPreset = opts.unsignedPreset || getCloudinaryUnsignedUploadPreset();

  if (unsignedPreset && cloudName) {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", unsignedPreset);
    // Unsigned presets usually fix asset folder / public-id rules in the Console.
    // Sending `folder` here often 400s when it does not match the preset (e.g. fahi_uploads).

    const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`;
    const uploadResp = await fetch(uploadUrl, { method: "POST", body: form });
    const uploadBody = await parseJsonSafe(uploadResp);
    if (!uploadResp.ok) {
      throw new Error(uploadBody.error?.message || "Cloudinary upload failed (unsigned preset).");
    }
    return mapCloudinaryUploadBody(uploadBody, file);
  }

  const signatureEndpoint = opts.signatureEndpoint || getCloudinarySignatureEndpoint();
  if (!signatureEndpoint) {
    throw new Error(
      "No Cloudinary upload path configured. Set window.__FAHI_CONFIG__.cloudinarySignatureEndpoint (signed) or cloudinaryUnsignedPreset (unsigned) in apply/index.html."
    );
  }

  const signResp = await fetch(signatureEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder: opts.folder || "fahi/applications",
    }),
  });

  const signBody = await parseJsonSafe(signResp);
  if (!signResp.ok) {
    throw new Error(signBody.error || "Could not sign Cloudinary upload request.");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signBody.apiKey);
  form.append("timestamp", String(signBody.timestamp));
  form.append("signature", signBody.signature);
  form.append("folder", signBody.folder);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(signBody.cloudName)}/auto/upload`;
  const uploadResp = await fetch(uploadUrl, { method: "POST", body: form });
  const uploadBody = await parseJsonSafe(uploadResp);
  if (!uploadResp.ok) {
    throw new Error(uploadBody.error?.message || "Cloudinary upload failed.");
  }

  return mapCloudinaryUploadBody(uploadBody, file);
}
