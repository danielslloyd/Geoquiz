# Geoquiz

Interactive geography quiz game built with vanilla JS and D3.js.

## Architecture

- `index.html` — single-page app; all game UI lives here
- `game.js` — all game logic (~5000 lines)
- `style.css` — all styles
- `4_niedrig.geo.json` — local GeoJSON for German states
- `data/england-counties.geo.json` — local GeoJSON for England's 47 ceremonial counties
- `data/mexico-states.geo.json` — local GeoJSON for the 32 Mexican states
- Capital/code data lives in `data/*.json`, loaded by `initializeGameData()` in `game.js` into `window[dataObjKey]` (`countryData`, `usStateData`, `indianStateData`, `germanStateData`, `englandCountyData`, `mexicanStateData`). `data-loader.js` is legacy/unused.
- `data/continents.json` — continent → country-name map (7-continent model) powering the Name-All-by-continent variants; loaded into `window.continentData`.
- `data/textures/earth-*.jpg` — NASA Blue Marble Next Generation (June, public domain) Earth textures for the orbital `spaceship` view. `earth-bmng-2048.jpg` (committed) is a full-globe low-res **base sphere** (instant paint + far side + fallback). `earth-cap-c{col}-r{row}.jpg` are a full-500m-res **8×4 grid of 45° tiles** (10800² each, ~230 MB total, **gitignored** — rebuild locally). At ≤500 km only a ~22° cap is ever visible, so each round loads only the handful of tiles that cap reaches (`orbitalLoadCap`/`capTilesForTarget`, pruned to the current cap) onto tile meshes at radius 1 over the base (radius 0.997, so tiles always win depth). Full res is delivered as tiles because a single browser texture caps at 16384 (Chrome/ANGLE `MAX_TEXTURE_SIZE`, even on big GPUs). Regenerate via `scripts/build-earth-texture.py` (downloads the eight 21600² 500m tiles, slices each 2×2 with Pillow; a `build_half()` two-hemisphere alternative is kept but unused). three.js (r160, ESM via importmap in `index.html`, exposed as `window.THREE`) renders it.
  - **NASA live fallback (for deploys without the gitignored cap tiles, e.g. Netlify).** `probeLocalTiles()` HEAD-checks `earth-cap-c0-r0.jpg` on entry; a 404 (or non-image 200) flips `orbitalNasaFallback` and, instead of the local tiles, each round **crops just the visible cap** straight out of a NASA equirectangular source and drapes it on a partial-sphere mesh (`nasaCapRect`→`capDestSize`→`setNasaCapMesh`/`makeRectMesh`), so the texture is always ≤ the GPU ceiling (never the whole oversized globe). Default source is the single **21600×10800** globe (`loadNasaGlobe`, prefers 21600, falls back to 5400×2700 if it won't decode; cropped via `cropGlobeToCanvas`, a 3-copy draw that handles antimeridian wrap). The **"500 m tiles"** checkbox (`#tune-hires-500m` → `orbitalUse500m`) opts into fetching NASA's full 21600² **500m** tiles live and stitching the cap from them (`build500mCap`/`tilePieces500m`/`fetch500mTile`, `createImageBitmap` crop+resize so a 466 MP tile is never held as a canvas); this works even when local tiles are present and falls back to the globe crop on any failure. `orbitalRefreshCap` picks the source (local tiles / globe crop / 500m); `orbitalCapToken` voids stale async builds. Crop canvases are capped at `CAP_TEX_MAX` (12000 px) for memory.
- `data/lakes.geo.json` — Natural Earth **110m** major lakes (Great Lakes, Victoria, Baikal, …), drawn as an overlay on world maps (`drawLakes`). Lakes track the map's detail level (`lakesResForDetail`): 110m is bundled locally; 50m/10m come from jsdelivr (`martynafford/natural-earth-geojson`), cached in `lakesCache` with the local file as fallback. They share the globe's `userSpaceOnUse` `#ocean-gradient` (kept in sync by `syncOceanGradient`) so they read as ocean; on flat maps they fill `var(--surface)` (the flat-map ocean colour) and carry a `var(--land-stroke)` coastline border.

## Country dots (dynamic)

`drawIslandMarkers`/`updateIslandMarkers` decide per-redraw whether each small feature shows as a clickable dot or its polygon outline, based on the largest polygon's pixel size vs `DOT_PIXEL_THRESHOLD`. On **flat maps** this is the live on-screen bbox (`path.bounds`). On the **globe** it's the size the feature would have at the **centre of view** — angular extent × projection scale (`featureAngularDim`, cached per candidate as `d.angDim`) — so the dot/outline choice depends only on zoom, **not** on how far the country has rotated toward the limb (perspective foreshortening no longer flips small countries into dots as they rotate out of view). Every quiz item is therefore always shown as *either* geometry or a dot at every detail level. `drawIslandMarkers` keeps the **largest** feature per name (some atlas resolutions split a country into a real polygon plus a stray micro-polygon — e.g. Australia at 50m — which would otherwise be mistaken for a dot). Big features (`geoArea > DOT_CANDIDATE_AREA`) are always outlines and skip the check. World micro-states with no polygon always dot (anchored at `capitalCoords`). Visible dots are spread apart by `relaxDots` (min centre-to-centre `DOT_SPACING` px; also nudged off small outline polygons) so dense clusters (Caribbean/Pacific) stay legible. The spaceship view shows neither dots nor highlights.
- `DOT_PIXEL_THRESHOLD` (min dot px, 0–20) and `DOT_SPACING` (dot spacing), plus `MEDIUM_SIMPLIFY_RETAIN`, are exposed as live tuning sliders. All tuning sliders (general + spaceship) live in a **Settings pop-up** (`#settings-overlay`, opened by `#settings-btn`), not inline in the controls bar; the `#spaceship-tuning` group inside it is shown only in spaceship mode.
- The orbital `spaceship` view renders on its own **three.js** WebGL canvas (not D3/SVG) — see the `spaceship` row below.

## Overseas territories

Dependencies that appear as their OWN world-atlas feature but belong to a sovereign parent (Puerto Rico→USA, Greenland→Denmark, New Caledonia→France, …) are tagged in `tagTerritories()` (keyed by ISO numeric id in `TERRITORY_BY_ID`, run from `loadMapData`). Each gets `properties.parent`, `properties.isTerritory`, and a `displayName` like "Puerto Rico (USA)". Effects: `highlightCountryOnGlobe`/`highlightFoundCountry` fill the parent **and** its territories (`featureBelongsTo`); a click on a territory counts as finding the parent (`handleCountryClick` uses `d.properties.parent || name`); free-explore/flag lookups resolve through the parent (`effectiveDataName`, parent flag). Because territories stay SEPARATE features with their own names, the parent's shape/centroid/bounding box (zoom, Shape-ID) naturally excludes them (with the Debug overlay on, clicking a country draws both pixel boxes — orange own-feature vs cyan with-territories — via `drawDebugBoundingBoxes`). Highlighted paths are `.raise()`d (`raiseHighlight`) so their outline paints on top of neighbours instead of being clipped.

## Map detail (LOD)

World (`mapObject: 'countries'`) modes pick their world-atlas resolution from the global `mapDetail` via `worldCountriesUrl()`. The `#detail-toggle` cycles three levels: `low`=110m, `medium`=50m simplified client-side, `high`=50m. The default is `medium`. Simplification happens in `worldFeaturesFromTopology()`: `topojson.presimplify`/`simplify` **return new topologies** (they don't mutate in place — capturing the return value is essential), and `MEDIUM_SIMPLIFY_RETAIN` (slider-tunable) is the fraction of points kept. Fetched topologies are cached in `worldTopoCache` (via `fetchWorldTopo`) so the slider re-simplifies without re-downloading. The 10m source is reserved for `country-shape-id` ("highest possible detail") and is not reachable from the toggle; `spaceship` forces coarse **110m** (it only needs countries for coast detection + its inset — the Blue Marble texture provides the visuals). `reloadWorldDetail()` refetches/re-simplifies, redraws, preserves rotation/scale and highlight — no new question. The toggle is hidden for `spaceship` and `country-shape-id`.

The globe defaults to tilt-locked (`gammaLocked = true`, north-up) and `medium` detail.

## Game Modes

| Mode key | Description |
|---|---|
| `countries` | Click globe to find country, then identify its flag and capital (3 sub-questions per country, special 2/3+1/3 layout). Once the flag sub-question is answered, the country's shape is coloured in with its own flag via an `objectBoundingBox` SVG `<pattern>` (`fillCountryWithFlag`) that follows the shape as the globe rotates/zooms |
| `us-states` | Click flat map to find US state, then identify its capital |
| `indian-states` | Click flat map to find Indian state, then identify its capital |
| `german-states` | Click flat map to find German Bundesland, then identify its capital |
| `uk-states` | Click flat map to find an England ceremonial county — county only, no capital (`findOnly: true`) |
| `mexican-states` | Click flat map to find a Mexican state, then identify its capital |
| `identify` | A country/state is highlighted — pick its name from 4 choices (supports all geos: world, US, India, Germany, England, Mexico) |
| `name-all` | Type country names to highlight them against a countdown timer; world or per-continent (region sub-selector) |
| `population-order` | Drag 5 countries into population order (high → low) |
| `mystery-flag` | A flag is shown — click the globe to find the matching country |
| `capitals-race` | A country is highlighted — type its capital to score |
| `country-shape-id` | Only the target country's outline is shown as a flat Mercator silhouette (no globe/neighbours/lakes/dots; **10m** max detail, borderless `.shape-target` fill, projection fitted to the country; only the single target path is drawn — `drawCountries` skips the rest) — pick its name from 4 choices (`countryShapeIdMode`). The 2 wrong answers are the most **shape-similar** quiz countries (`generateShapeIdOptions`/`shapeSimilarNames`): a size/aspect/compactness descriptor (`computeShapeDescriptor`, cached in `shapeDescriptorCache`), z-scored with size down-weighted since the silhouette is fitted to fill the view |
| `find-capital` | A capital name is shown — click the static world map to drop a guess marker, Submit; scored by total great-circle distance over X rounds (`findCapitalMode`) |
| `spaceship` | A photographic low-Earth-orbit view: a **three.js** textured globe (NASA Blue Marble — low-res base sphere + per-round full-500m-res cap tiles, see the textures note) through a perspective camera over a random coastal sub-point, tilted toward the shore so the curved horizon sits in the upper third. **Altitude tunable ≤500 km** via the Orbit-height slider (`orbitAltitudeKm`); `orbitDistance()`=(R+h)/R with the default tilt (`defaultOrbitTilt()`) + pan clamp (`clampOrbitTilt()`) derived from it. **Drag to look around** — grab-style (the point under the cursor sticks; FOV-derived sensitivity) about the fixed sub-point. Guess the sub-point on the **scroll-zoomable** inset map (`d3.zoom`), Submit; **scored** by accuracy + speed − panning with slider-tunable weights (`scoreAccuracyWeight`/`scoreSpeedWeight`/`scorePanWeight` + scales). Inset guess/answer pins + the connecting line use `vector-effect: non-scaling-stroke` and a `1/k` radius so they stay a **constant on-screen size** as the inset is zoomed. Atmosphere is **two** additive meshes: `makeAtmosphere` is a BackSide shell — a **soft limb glow that fades gradually from the horizon into space** (per-ray closest-approach → `0→1` limb-to-zenith, smooth falloff over the lower band; `uCamDist` tracks altitude) — and `makeAtmosphereFront` is a FrontSide haze painted **over the earth near its edge** (intensity keyed to how grazing each view ray is: ~0 at the sub-point, peaking at the limb) so the horizon reads as soft/hazy rather than a crisp cutout — no hard shell edge either way. A slider-free **"Country outlines" hint** (`#tune-hint-outlines` → `setOrbitalHint`/`orbitalHintOn`) overlays thin white borders on the globe: `buildCountryLinesGeometry` turns the loaded 110m countries into `LineSegments` on the sphere at radius 1.004 (each border arc slerp-subdivided so long spans hug the surface and aren't occluded), aligned to the texture via `surfaceNormal`; the opaque earth hides far-side lines by depth test. On **mobile** (`orbitalMobileSplit`, ≤768px + `body.spaceship-active`) the view **splits**: the earth canvas fills the top and the inset becomes a full-width map below it (`orbitalResize` reserves the inset height). Renders on its own WebGL canvas over the hidden `#globe` SVG (sized from the container in `orbitalResize` — measure the container, not the replaced canvas, or it runaway-zooms). Renderer: `ensureOrbital`/`orbitalSetTarget`/`orbitalLoadCap`/`drawSpaceshipView`, disposed via `disposeOrbital` |

## UI Structure

### Top Bar (in-game)
Single thin bar with: title | mode icons | score display. Two dropdown groups:
- **Find (🔍)** — expands to: World, USA, India, Germany, UK
- **Identify (❓)** — expands to same 5 geos
- Direct icons: ⌨️ name-all, 📊 population, 🚩 mystery-flag, 🏛️ capitals-race

### Mode Selector (landing page)
Full-screen card grid. "Find on the Map" and "Identify" open sub-selectors for region choice.

### Score sync
`syncScoreDisplay()` keeps the top-bar inline score in sync with `gameState`. Called automatically after every score/question update.

## Adding a New Game Mode

1. Add an entry to `QUIZ_MODES` in `game.js` with the relevant config flags.
2. Add `mysteryFlagMode`/`capitalsRaceMode`/`identifyOnly`-style boolean flag if the mode has unique question handling (maxSub=1).
3. Add a render function (`renderXxxQuestion()`).
4. Hook it into `startNewQuestion()` — set `gameState.questionType` and call your render function.
5. If the mode scores one point per target (not per sub-question), add its flag to `maxSubForMode(modeConfig)` — the **single** source of truth for sub-question count, used by `handleCorrectAnswer`, `giveUp`, and `endGame` alike (a mode missing from it there is what capped Shape-ID at 50% on a perfect run).
6. Add to the top-bar dropdowns in `index.html`, `showFindModeSelector()`, `showIdentifyModeSelector()`, and `resetModeSelector()` in `game.js`.

## Adding a New Region (Find/Identify)

1. Create a quiz list array and data object (see `ukCountries` / `ukCountryData` pattern).
2. Add a `QUIZ_MODES` entry with `useGlobe: false`, `mapUrl`, `mapObject: null` (for GeoJSON) or `'states'`/`'countries'` (for TopoJSON).
3. Add to `showFindModeSelector()` and `showIdentifyModeSelector()` region buttons.
4. Add to `startIdentifyMode()` — it copies config from the base mode automatically.
5. If GeoJSON uses unusual property names for feature names, add a fallback in `loadMapData()`'s `mapObject === null` branch.
6. Add dropdown entries in the top-bar HTML (`#find-dropdown`, `#identify-dropdown`).

## Key Functions

- `startGameWithMode(mode)` — reset state and begin a game
- `startNewQuestion()` — selects new target, dispatches to the right render function
- `handleCountryClick(event, d)` — globe/map click handler; accepts `location` and `mystery-flag` question types
- `handleCorrectAnswer(element)` — awards point, auto-advances sub-questions
- `giveUp()` — reveals answer for current question; mode-specific early-return handlers at the top
- `endGame()` — shows final score
- `showFindModeSelector()` — shows region picker for Find modes
- `showIdentifyModeSelector()` — shows region picker for Identify mode
- `startIdentifyMode(region)` — configures identify mode with a region's data then starts game
- `syncScoreDisplay()` — syncs top-bar score with gameState
- `setupGlobe()` — creates SVG (viewBox-based, responsive), projection, drag, zoom, and touch handlers

## Globe Rotation

Uses quaternion-based rotation via Fil's versor library (inlined). Key state:
- `v0, r0, q0` — drag start state (cartesian point, rotation, quaternion)
- `r_unconstrained` — stores full rotation (including gamma) for quaternion continuity between drags
- `gammaLocked` — when true, gamma (tilt) is forced to 0; togglable via UI button

**Important:** Any code that changes `projection.rotate()` outside of the drag handler (e.g. `rotateToCountry`, zoom handler, reset points) must also update `r_unconstrained = projection.rotate().slice()` to prevent snap-back on the next drag.

## Touch Support

SVG uses `touch-action: none` and custom touch handlers:
- **Single-finger drag** — rotates globe / pans flat maps (8px movement threshold to distinguish from taps)
- **Pinch-to-zoom** — scales projection, clamped to `[initialScale, 2000]`
- **Tap** — dispatches synthetic click for country selection (blocked after drag or pinch via `moved`/`wasPinch` flags)

## Zoom Constraints

- Initial scale is stored in `gameState.initialScale` after map data loads
- Zoom out is clamped: `minScale = gameState.initialScale` (can't zoom out past starting view)
- Both scroll-wheel and pinch-zoom respect these limits

## Data Shape

Each entry in `countryData` / `usStateData` / `indianStateData` / `germanStateData` / `ukCountryData`:
```js
{
  code: 'us',           // ISO 3166-1 alpha-2 (used for flagcdn.com URL)
  capital: 'Washington, D.C.',
  capitalCoords: [38.9, -77.0], // [lat, lon] — only in countryData
  population: 331893745,        // only in countryData
  similar: ['Canada', ...]      // used for distractor generation
}
```

## Running Locally

```bash
npm start   # python dev-server.py — serves on localhost:8000 with no-cache headers
```

`dev-server.py` is a tiny no-cache static server (plain `python -m http.server` caches
aggressively, so edits often don't show on reload). `.claude/launch.json` uses the same
script for the in-editor preview.
