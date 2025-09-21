# Rowan ACDA — Static Site

A modern, responsive site with deep red / white theme, event cards with modals, and a password‑gated Sight‑Singing PDF vault (client‑side SHA‑256).

## Quick Start
- Serve locally (any static server) or push to Netlify/GitHub Pages.
- Pages: `index.html`, `events.html`, `members.html`, `eboard.html`, `resources.html`, `resources-sightsinging.html`.
- Data files: `/data/events.json`, `/data/resources.json`.

## Events
Edit `/data/events.json`. Each event supports:
```json
{ "id":"slug", "title":"", "date":"2025-09-12T18:30:00-04:00", "location":"", "tags":["General"], "image":"/assets/events/x.svg", "excerpt":"", "description":"<p>HTML ok</p>", "links":[{"label":"Add to Calendar","href":"/ics/file.ics"}] }
```

## Sight‑Singing Vault (client‑side)
- Update `/data/resources.json` with groups and files.
- Passwords stored as `sha256:<base64>`. Use `/tools/hash.html` to generate a value.
- Add PDFs under `/assets/pdfs/<group>/` and reference them by path.

> Note: This gate deters casual access only. For real protection, put PDFs behind an authenticated function (Auth0/Netlify) later.

## Theming
Colors, radius, shadows in `/css/base.css`. Typography via Outfit + Inter from Google Fonts.

## Accessibility
Semantic landmarks, keyboard‑friendly menus, focus styles, and ESC‑to‑close modals.
