const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");

const cloudName = defineSecret("CLOUDINARY_CLOUD_NAME");
const apiKey = defineSecret("CLOUDINARY_API_KEY");
const apiSecret = defineSecret("CLOUDINARY_API_SECRET");
const allowedOriginsCsv = defineString("CLOUDINARY_ALLOWED_ORIGINS", { default: "" });

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAllowedOrigins() {
  const raw = safeTrim(allowedOriginsCsv.value());
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCloudinarySignature(params, secret) {
  const encoded = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${encoded}${secret}`).digest("hex");
}

exports.createCloudinarySignature = onRequest(
  { secrets: [cloudName, apiKey, apiSecret] },
  (req, res) => {
    const origin = safeTrim(req.get("origin"));
    const allowedOrigins = parseAllowedOrigins();

    if (origin) {
      if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
        res.status(403).json({ error: "Origin not allowed." });
        return;
      }
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }

    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const requestedFolder = safeTrim(req.body && req.body.folder);
    const folder = requestedFolder || "fahi/applications";

    if (!/^[a-zA-Z0-9/_-]+$/.test(folder)) {
      res.status(400).json({ error: "Invalid folder." });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signatureParams = { folder, timestamp };
    const signature = buildCloudinarySignature(signatureParams, apiSecret.value());

    res.status(200).json({
      cloudName: cloudName.value(),
      apiKey: apiKey.value(),
      timestamp,
      folder,
      signature,
    });
  }
);
