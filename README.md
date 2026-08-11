# Geoquiz 🌍

An interactive geography quiz game — twenty-odd game modes built on a draggable 3D globe
and a set of flat regional maps. Vanilla JavaScript, D3.js and three.js; no build step.

## Game modes

**Find it on the map** — a name is given, you click the place.

| Mode | What you do |
|---|---|
| Countries of the World | Find the country on the globe, then pick its flag and its capital |
| US States / Indian States / German States / Mexican States | Find the state, then pick its capital |
| England Counties | Find the ceremonial county (no capital round) |
| Flags | Two ways to match flags to countries: see one flag and find its country, or drag every flag onto the map at once — a correct drop fills that country's shape with its flag |
| Capitals | Three ways to test the same thing, under one tile: pick the capital from four options, type it against the clock, or pin it on the map and be scored by distance |
| Map Puzzle | A jigsaw of any geography — world, USA, India, Germany, England or Mexico. Pieces start scattered in the ocean around the map itself — drag each onto its slot, where it snaps home and turns green. **Easy** names every slot and snaps generously; **Medium** gives you the country's bare outline and a fifth of the tolerance. **Hard** is a different game — pieces arrive one at a time against an empty silhouette, nothing snaps, and nothing stays on the map, so every piece is placed blind and scored on how far off you were and how fast you were. Each drop is graded green-to-red, and the round ends by showing the map you actually built |

**Identify it** — the place or its picture is shown, you name it.

| Mode | What you do |
|---|---|
| Identify | A place is highlighted — pick its name from four choices (any of the six regions) |
| Country Shape ID | Name a country from its silhouette alone, with shape-alike decoys |
| Where Is My Spaceship? | A photographic view from low Earth orbit — pin your sub-point on an inset map. Its **Sandbox** shows every spot the game can pick and every heading you could face, and freezes 10 of them into a short hash so a friend can play the identical 10 rounds |

**Against the clock, and other things**

| Mode | What you do |
|---|---|
| Name All | Type every country (or every state, or one continent) before the timer runs out |
| Order by Population | Drag five countries into population order |
| Free Explore | No quiz — spin the globe and click anything for its flag, capital and population |
| Places I've Been | Paint a personal travel map (lived / visited / passed through) and share it as a link |

## Sharing

The address bar is the save file. **Places I've Been** encodes your whole map plus a short
note into the URL, so "Copy shareable link" produces something a friend can open directly.
Finishing any quiz offers **Challenge a friend** — a link that starts the same mode and shows
your score as the target to beat.

## Playing

```bash
npm start
```

Then open <http://localhost:8000>.

This runs `dev-server.py`, a tiny static server that sends no-cache headers — plain
`python -m http.server` caches hard enough that edits often don't show up on reload.

Opening `index.html` straight from the filesystem mostly works, but the modes that fetch
map data or textures at runtime will be blocked by the browser's `file://` CORS rules, so
the local server is the better bet.

## Settings

The ⚙️ pop-up holds live tuning sliders — answer pacing, island-dot size and spacing,
the puzzle's snap distance and snap click, the
accuracy-versus-speed balance for the blind puzzle, and (in spaceship mode) orbit height
plus a full five-stop editor for the atmospheric limb gradient. The controls bar carries a map-detail
toggle cycling three levels of coastline resolution.

## Built with

- **D3.js v7** — projections, geo maths, the globe and every flat map
- **TopoJSON** + [world-atlas](https://github.com/topojson/world-atlas) / us-atlas, at 110m, 50m and 10m
- **three.js r160** — the WebGL orbital view in spaceship mode
- **NASA Blue Marble Next Generation** (public domain) — Earth imagery, with a live NASA
  fetch as fallback where the local high-res tiles aren't deployed
- **Natural Earth** — major lakes overlay
- **flagcdn.com** — flag images
- **Wikimedia Commons** — skyline photographs, licence-filtered to PD/CC0/CC-BY/CC-BY-SA
  (powers a Skyline ID mode that is built but currently hidden from the menu while the
  photo pool is vetted)
- Vanilla JS and CSS for everything else — no framework, no bundler

## Repo layout

```
index.html   single-page app; all UI markup
game.js      all game logic
style.css    all styles
data/        capitals, codes, populations, continents, local GeoJSON, Earth textures
scripts/     build-earth-texture.py — regenerates the high-res Earth tiles
dev-server.py
```

`CLAUDE.md` carries the developer-facing architecture notes: how the level-of-detail
system, dynamic country dots, overseas-territory tagging, shape framing and the orbital
renderer actually work, and what to touch when adding a mode or a region.
