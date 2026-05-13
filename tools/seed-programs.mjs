/**
 * Upload data/programs.json into Firestore collection "programs" (document id = slug).
 *
 * Prerequisites:
 * 1) npm install
 * 2) Download a service account JSON from Firebase Console → Project settings → Service accounts
 * 3) export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccount.json"
 * 4) npm run seed:programs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const raw = readFileSync(join(root, "data", "programs.json"), "utf8");
const data = JSON.parse(raw);
const programs = data.programs || [];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON path.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

let order = 0;
for (const p of programs) {
  const slug = p.slug;
  if (!slug) continue;
  const { slug: _s, ...fields } = p;
  await db.collection("programs").doc(slug).set({ ...fields, slug, sortOrder: order++ }, { merge: true });
}

console.log(`Seeded ${programs.length} programme documents into Firestore (collection: programs).`);
