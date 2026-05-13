# FAHI Website

A clean, minimal revamp for **FAHI — First American Health Institute** built with plain HTML, CSS, and JavaScript. No build step is required.

## Project structure

```
afrcan insititute/
├── index.html          # Header, navigation, mega menu, hero
├── css/
│   └── styles.css      # All styles
├── js/
│   └── main.js         # Nav, hero slider, rotating headline
└── assets/
    └── images/
        └── logo.png    # FAHI logo
```

## How to run

Open `index.html` in a browser, or use the optional local server below.

For a better dev experience, use a local server (optional):

```bash
# Python (built-in on macOS)
python3 -m http.server 5500

# Then visit http://localhost:5500
```

## Color palette

| Color | Hex | Use |
| --- | --- | --- |
| FAHI Blue | `#0077c8` | Main nav, buttons, active states |
| Navy | `#0b2f4a` | Text and deep hover states |
| Teal Accent | `#10b7c4` | Hero rotating text and accents |
| Soft Blue | `#e7f6fb` | Light hover backgrounds |

## What's built so far

- [x] White top bar with FAHI logo, social icons, and login icons
- [x] Blue sticky main navigation
- [x] Responsive mobile/tablet menu with login icons beside the burger
- [x] Programs mega dropdown with six FAHI program groups
- [x] Hero image slider with rotating healthcare-focused headline
- [x] Top bar hides on scroll while main nav remains sticky

## Secure Cloudinary uploads (no secret in browser)

The site now uploads documents with **signed Cloudinary uploads**:

- Browser requests a short-lived signature from a Firebase Cloud Function.
- Function signs with Cloudinary API secret (stored in Firebase secrets).
- Browser uploads directly to Cloudinary with that signature.
- API secret is never exposed in frontend JS/HTML.

### 1) Install Functions deps

```bash
cd functions
npm install
```

### 2) Set Cloudinary secrets in Firebase

```bash
firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
```

Optional CORS allow-list (comma-separated), add in `functions/.env`:

```bash
echo 'CLOUDINARY_ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:5500' >> functions/.env
```

### 3) Deploy the signature endpoint

```bash
firebase deploy --only functions:createCloudinarySignature
```

### 4) Point frontend at the signature endpoint

Before modules load on pages that upload files (e.g. `apply/index.html`), set:

```html
<script>
  window.__FAHI_CONFIG__ = window.__FAHI_CONFIG__ || {};
  window.__FAHI_CONFIG__.cloudinarySignatureEndpoint =
    "https://REGION-PROJECT.cloudfunctions.net/createCloudinarySignature";
</script>
```

## Next steps

- About section
- Programs grid
- Admissions / Apply page
- Footer
