# Rowan ACDA Static Site (GitHub Pages Ready)

- Shared navbar (`partials/nav.html`) is injected on every page via `js/app.js`.
- Login button opens a demo modal (no real auth); state is stored in `localStorage`.
- Responsive cards grid, mobile navbar, accessible colors, and `aria-current` included.
- Fonts: Google **Outfit** for UI/Body.

## Structure
```
images/
  ├── logo.svg
  ├── social-card.png
  ├── event-placeholder.png
  ├── eboard-president.png
  ├── eboard-vice.png
  ├── eboard-secretary.png
  ├── eboard-treasurer.png
  ├── eboard-events.png
  └── eboard-web.png
css/
  └── style.css
js/
  └── app.js
partials/
  └── nav.html
java/
  └── LoginDemo.java  (optional example file, not used by the site)
index.html
events.html
chapter.html
eboard.html
resources.html
```

## Deploy (GitHub Pages)
1. Create a repo and upload everything in this folder.
2. In GitHub → **Settings → Pages** → set Source to your default branch, root (`/`).
3. Open your Pages URL.
