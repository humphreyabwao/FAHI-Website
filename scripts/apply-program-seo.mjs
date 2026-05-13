/**
 * Rewrite SEO block (after viewport meta, before font preconnect) in programs/<slug>/index.html from data/programs.json.
 * Run: node scripts/apply-program-seo.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SITE = "https://firstamericanhealthinstitute.org";
const OG_FALLBACK_IMG =
  "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&h=630&q=80";

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildHeadSeo(p) {
  const slug = p.slug;
  const pageUrl = `${SITE}/programs/${slug}/`;
  const title = `${p.title} | FAHI`;
  const desc = p.metaDescription || p.intro || "";
  const ogImage = /^https?:\/\//i.test(p.heroImage || "") ? p.heroImage : OG_FALLBACK_IMG;
  const ogImageAlt = p.heroImageAlt || p.title || "FAHI programme";
  const courseLd = {
    "@type": "Course",
    name: p.title,
    description: desc,
    url: pageUrl,
    image: /^https?:\/\//i.test(p.heroImage || "") ? [p.heroImage] : [OG_FALLBACK_IMG],
    provider: {
      "@type": "EducationalOrganization",
      name: "First American Health Institute",
      url: `${SITE}/`,
    },
  };
  if (p.eyebrow) courseLd.educationalLevel = p.eyebrow;

  const breadcrumbLd = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Programmes", item: `${SITE}/programs/` },
      { "@type": "ListItem", position: 3, name: p.title, item: pageUrl },
    ],
  };

  const ld = { "@context": "https://schema.org", "@graph": [courseLd, breadcrumbLd] };

  return `  <title>${escAttr(title)}</title>
  <meta name="description" content="${escAttr(desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="geo.region" content="KE" />
  <link rel="canonical" href="${pageUrl}" />
  <meta property="og:locale" content="en_KE" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="First American Health Institute" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(desc)}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:image" content="${escAttr(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escAttr(ogImageAlt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(desc)}" />
  <meta name="twitter:image" content="${escAttr(ogImage)}" />
  <meta name="fa-seo-base" content="${SITE}" />
  <script id="fahi-program-seo-ld" type="application/ld+json">${JSON.stringify(ld)}</script>
`;
}

const data = JSON.parse(fs.readFileSync(path.join(root, "data", "programs.json"), "utf8"));
const betweenRe =
  /(<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>)\s*[\s\S]*?(\n\s*<link rel="preconnect")/;

for (const p of data.programs) {
  const file = path.join(root, "programs", p.slug, "index.html");
  if (!fs.existsSync(file)) {
    console.warn("skip missing", file);
    continue;
  }
  let html = fs.readFileSync(file, "utf8");
  if (!betweenRe.test(html)) {
    console.warn("pattern miss", p.slug);
    continue;
  }
  html = html.replace(betweenRe, `$1\n${buildHeadSeo(p)}$2`);
  fs.writeFileSync(file, html);
  console.log("updated", p.slug);
}
