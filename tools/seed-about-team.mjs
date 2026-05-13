/**
 * Upload data/about-team-seed.json into Firestore collection "aboutTeamMembers" (document id = member id).
 *
 * Prerequisites:
 * 1) npm install
 * 2) export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccount.json"
 * 3) npm run seed:about-team
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const raw = readFileSync(join(root, "data", "about-team-seed.json"), "utf8");
const data = JSON.parse(raw);
const members = data.members || [];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON path.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

for (const m of members) {
  const id = m.id;
  if (!id || typeof id !== "string") continue;
  const { id: _id, ...rest } = m;
  let imageVersion =
    typeof rest.imageVersion === "number" && !Number.isNaN(rest.imageVersion)
      ? rest.imageVersion
      : parseInt(String(rest.imageVersion || 0), 10) || 0;
  if (imageVersion < 0) imageVersion = 0;
  if (imageVersion > 9999999999999999) imageVersion = 9999999999999999;
  const payload = {
    category: rest.category,
    sortOrder: typeof rest.sortOrder === "number" ? rest.sortOrder : parseInt(String(rest.sortOrder || 0), 10) || 0,
    name: String(rest.name || ""),
    role: String(rest.role || ""),
    bio: String(rest.bio || ""),
    imageUrl: String(rest.imageUrl || ""),
    imageAlt: String(rest.imageAlt || ""),
    imagePublicId: String(rest.imagePublicId || "").slice(0, 500),
    imageVersion,
  };
  await db.collection("aboutTeamMembers").doc(id).set(payload, { merge: false });
}

console.log(`Seeded ${members.length} team member documents into Firestore (collection: aboutTeamMembers).`);
