/**
 * Upload data/careers-seed.json into Firestore collection "careers" (document id = slug).
 *
 * Prerequisites:
 * 1) npm install
 * 2) export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccount.json"
 * 3) npm run seed:careers
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const raw = readFileSync(join(root, "data", "careers-seed.json"), "utf8");
const data = JSON.parse(raw);
const careers = data.careers || [];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON path.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

for (const c of careers) {
  const slug = c.slug;
  if (!slug || typeof slug !== "string") continue;
  const { slug: _s, ...rest } = c;
  const payload = {
    slug,
    title: String(rest.title || ""),
    summary: String(rest.summary || ""),
    description: String(rest.description || ""),
    department: String(rest.department || ""),
    location: String(rest.location || ""),
    employmentType: String(rest.employmentType || ""),
    sortOrder:
      typeof rest.sortOrder === "number" && !Number.isNaN(rest.sortOrder)
        ? rest.sortOrder
        : parseInt(String(rest.sortOrder || 0), 10) || 0,
    active: rest.active === true,
  };
  await db.collection("careers").doc(slug).set(payload, { merge: false });
}

console.log(`Seeded ${careers.length} career documents into Firestore (collection: careers).`);
