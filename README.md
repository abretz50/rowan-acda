# Rowan NAfME Static Site (GitHub Pages Ready)

**Folders you asked for:** `images/`, `css/`, and a `java/` file (optional) are included. Real site logic uses `js/app.js`.

## Structure
```
images/
  └─ logo.svg
css/
  └─ style.css
js/
  └─ app.js
partials/
  └─ nav.html    ← shared navbar + login modal loaded on every page
java/
  └─ LoginDemo.java  ← not used by the site (optional example)
index.html
events.html
chapter.html
eboard.html
resources.html
```

## How it works
- Every page has a `<div id="navbar"></div>`. `js/app.js` fetches `partials/nav.html` and injects it, so the same navbar & login appear site‑wide.
- The **Login** button opens a demo modal and stores a fake user in `localStorage` (toggle changes to **Log out**). Swap this later with real auth if needed.

## Deploy on GitHub Pages
1. Create a repo and upload this whole folder (or unzip into it).
2. GitHub → **Settings → Pages** → Source: `main` (or `master`), Root (`/`).
3. Visit the Pages URL shown.

— Generated 2025-08-14T20:58:44
