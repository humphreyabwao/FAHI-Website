/**
 * Upload data/lease-equipment.json into Firestore collection "leaseEquipment".
 * npm run seed:lease-equipment  (requires GOOGLE_APPLICATION_CREDENTIALS)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const raw = readFileSync(join(root, "data", "lease-equipment.json"), "utf8");
const items = JSON.parse(raw).items || [];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON path.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

for (const item of items) {
  const slug = item.slug;
  if (!slug) continue;
  const { slug: _s, ...rest } = item;
  const priceAmount =
    rest.priceAmount != null && rest.priceAmount !== "" ? Number(rest.priceAmount) : null;
  const payload = {
    title: String(rest.title || ""),
    category: String(rest.category || ""),
    description: String(rest.description || ""),
    imageUrl: String(rest.imageUrl || ""),
    imageAlt: String(rest.imageAlt || ""),
    sortOrder: Number(rest.sortOrder) || 10,
    available: rest.available !== false,
  };
  if (priceAmount != null && !Number.isNaN(priceAmount)) {
    payload.priceAmount = priceAmount;
    payload.priceCurrency = String(rest.priceCurrency || "KSh");
    payload.pricePeriod = String(rest.pricePeriod || "24 hrs");
    if (rest.priceLabel) payload.priceLabel = String(rest.priceLabel);
  }
  await db.collection("leaseEquipment").doc(slug).set(payload, { merge: false });
}

console.log(`Seeded ${items.length} documents into leaseEquipment.`);
