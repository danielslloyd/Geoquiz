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
- `data/skyline-cities.json` — seed list for `skyline-id`: the 100 largest US cities + ~117 of the largest world cities, keyed by city name (`label`, `country`, `region`, `population`, optional `query` override). Loaded into `window.skylineCityData`. `population`/`country`/`region` are never shown — they exist only to rank distractors.
- `data/textures/earth-*.jpg` — NASA Blue Marble Next Generation (June, public domain) Earth textures for the orbital `spaceship` view. `earth-bmng-2048.jpg` (committed) is a full-globe low-res **base sphere** (instant paint + far side + fallback). `earth-cap-c{col}-r{row}.jpg` are a full-500m-res **8×4 grid of 45° tiles** (10800² each, ~230 MB total, **gitignored** — rebuild locally). At ≤500 km only a ~22° cap is ever visible, so each round loads only the handful of tiles that cap reaches (`orbitalLoadCap`/`capTilesForTarget`, pruned to the current cap) onto tile meshes at radius 1 over the base (radius 0.997, so tiles always win depth). Full res is delivered as tiles because a single browser texture caps at 16384 (Chrome/ANGLE `MAX_TEXTURE_SIZE`, even on big GPUs). Regenerate via `scripts/build-earth-texture.py` (downloads the eight 21600² 500m tiles, slices each 2×2 with Pillow; a `build_half()` two-hemisphere alternative is kept but unused). three.js (r160, ESM via importmap in `index.html`, exposed as `window.THREE`) renders it.
  - **NASA live fallback (for deploys without the gitignored cap tiles, e.g. Netlify).** `probeLocalTiles()` HEAD-checks `earth-cap-c0-r0.jpg` on entry; a 404 (or non-image 200) flips `orbitalNasaFallback` and, instead of the local tiles, each round **crops just the visible cap** straight out of a NASA equirectangular source and drapes it on a partial-sphere mesh (`nasaCapRect`→`capDestSize`→`setNasaCapMesh`/`makeRectMesh`), so the texture is always ≤ the GPU ceiling (never the whole oversized globe). Default source is the single **21600×10800** globe (`loadNasaGlobe`, prefers 21600, falls back to 5400×2700 if it won't decode; cropped via `cropGlobeToCanvas`, a 3-copy draw that handles antimeridian wrap). The **"500 m tiles"** checkbox (`#tune-hires-500m` → `orbitalUse500m`) opts into fetching NASA's full 21600² **500m** tiles live and stitching the cap from them (`build500mCap`/`tilePieces500m`/`fetch500mTile`, `createImageBitmap` crop+resize so a 466 MP tile is never held as a canvas); this works even when local tiles are present and falls back to the globe crop on any failure. `orbitalRefreshCap` picks the source (local tiles / globe crop / 500m); `orbitalCapToken` voids stale async builds. Crop canvases are capped at `CAP_TEX_MAX` (12000 px) for memory.
- `data/lakes.geo.json` — Natural Earth **110m** major lakes (Great Lakes, Victoria, Baikal, …), drawn as an overlay on world maps (`drawLakes`). Lakes track the map's detail level (`lakesResForDetail`): `low`/`medium` both use the bundled local 110m file, `high` fetches 50m from jsdelivr (`martynafford/natural-earth-geojson`), cached in `lakesCache` with the local file as fallback. `medium` maps to 110m (not 50m) deliberately — country coastlines at `medium` are the 50m source simplified down to `MEDIUM_SIMPLIFY_RETAIN` (20%, locked) client-side, but raw 50m lakes have no equivalent simplification pass, so they used to render sharper than the coastline they sit inside; 110m lakes are close in coarseness to a 20%-simplified 50m coastline and need no network fetch. They share the globe's `userSpaceOnUse` `#ocean-gradient` (kept in sync by `syncOceanGradient`) so they read as ocean; on flat maps they fill `var(--surface)` (the flat-map ocean colour) and carry a `var(--land-stroke)` coastline border. `MIN_LAKE_DIAM_KM` (32 km, locked) filters out lakes below Great Salt Lake size via `lakeInscribedDiamKm`.

## Country dots (dynamic)

`drawIslandMarkers`/`updateIslandMarkers` decide per-redraw whether each small feature shows as a clickable dot or its polygon outline, based on the size of the feature's **largest individual polygon part** vs `DOT_PIXEL_THRESHOLD` — not the bounding box of every part combined. A feature whose parts are scattered across a wide area (e.g. a 10-island nation spanning many degrees) would otherwise register as "big" from its combined bbox alone even if no single island is more than a pixel; measuring per-part fixes that. On **flat maps** this is `featureMaxPartPixelDim` (splits the feature into its polygon parts via `featureParts`, takes `path.bounds` of each part individually, keeps the max). On the **globe** it's `featureAngularDim` (same per-part split, `angularDimOfPart` computes each part's angular size directly from its own points rather than via `d3.geoBounds`, then the max across parts is multiplied by projection scale) — cached per candidate as `d.angDim` — so the dot/outline choice depends only on zoom, **not** on how far the country has rotated toward the limb. Per-part angular sizing bypasses `d3.geoBounds` deliberately: on an *isolated* small ring that happens to sit right at ±180° (e.g. a sliver of Fiji), `d3.geoBounds` can't tell which side is "outside" without more surrounding context and reports the full 360° — `lonSpanDeg` (360° minus the largest gap between sorted longitudes) resolves this correctly from the ring's own points. Every quiz item is therefore always shown as *either* geometry or a dot at every detail level. `drawIslandMarkers` keeps the **largest** feature per name (some atlas resolutions split a country into a real polygon plus a stray micro-polygon — e.g. Australia at 50m — which would otherwise be mistaken for a dot; this is a *different* mechanism from the per-part sizing above — it dedups across multiple array entries sharing a name, not across parts within one entry's geometry). Big features (`geoArea > DOT_CANDIDATE_AREA`, a sum-of-areas check unaffected by part scatter) are always outlines and skip the check. World micro-states with no polygon always dot (anchored at `capitalCoords`). Visible dots are spread apart by `relaxDots` (min centre-to-centre `DOT_SPACING` px; also nudged off small outline polygons) so dense clusters (Caribbean/Pacific) stay legible. The spaceship view shows neither dots nor highlights.
- `DOT_PIXEL_THRESHOLD` (min dot px, 0–20) and `DOT_SPACING` (dot spacing) are exposed as live tuning sliders; `MEDIUM_SIMPLIFY_RETAIN` (20%) and `MIN_LAKE_DIAM_KM` (32 km) are locked constants, no longer sliders. All tuning sliders (general + spaceship) live in a **Settings pop-up** (`#settings-overlay`, opened by `#settings-btn`), not inline in the controls bar; the `#spaceship-tuning` group inside it is shown only in spaceship mode. A **Gameplay** group holds `ANSWER_PAUSE_MS` (see Answer pacing, below).
- The orbital `spaceship` view renders on its own **three.js** WebGL canvas (not D3/SVG) — see the `spaceship` row below.

## Overseas territories

Dependencies that appear as their OWN world-atlas feature but belong to a sovereign parent (Puerto Rico→USA, Greenland→Denmark, New Caledonia→France, …) are tagged in `tagTerritories()` (keyed by ISO numeric id in `TERRITORY_BY_ID`, run from `loadMapData`). Each gets `properties.parent`, `properties.isTerritory`, and a `displayName` like "Puerto Rico (USA)". Effects: `highlightCountryOnGlobe`/`highlightFoundCountry` fill the parent **and** its territories (`featureBelongsTo`); a click on a territory counts as finding the parent (`handleCountryClick` uses `d.properties.parent || name`); free-explore/flag lookups resolve through the parent (`effectiveDataName`, parent flag). Because territories stay SEPARATE features with their own names, the parent's shape/centroid/bounding box (zoom, Shape-ID) naturally excludes them (with the Debug overlay on, clicking a country draws both pixel boxes — orange own-feature vs cyan with-territories — via `drawDebugBoundingBoxes`). Highlighted paths are `.raise()`d (`raiseHighlight`) so their outline paints on top of neighbours instead of being clipped.

## Map detail (LOD)

World (`mapObject: 'countries'`) modes pick their world-atlas resolution from the global `mapDetail` via `worldCountriesUrl()`. The `#detail-toggle` cycles three levels: `low`=110m, `medium`=50m simplified client-side, `high`=50m. The default is `medium`. Simplification happens in `worldFeaturesFromTopology()`: `topojson.presimplify`/`simplify` **return new topologies** (they don't mutate in place — capturing the return value is essential), and `MEDIUM_SIMPLIFY_RETAIN` (**locked at 0.2** — no longer slider-tunable) is the fraction of points kept. Fetched topologies are cached in `worldTopoCache` (via `fetchWorldTopo`) so re-detailing doesn't re-download. The 10m source is reserved for `country-shape-id` ("highest possible detail") and is not reachable from the toggle; `spaceship` forces coarse **110m** (it only needs countries for coast detection + its inset — the Blue Marble texture provides the visuals). `reloadWorldDetail()` refetches/re-simplifies, redraws, preserves rotation/scale and highlight — no new question. The toggle is hidden for `spaceship` and `country-shape-id`.

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
| `name-all` | Type all names in a geography to highlight them against a countdown timer (~6s/item, min 60s). One mode key (`nameAllMode:true`); `showNameAllModeSelector()`'s 12-button picker covers world + the 6 continents (subsets of `quizCountries`/`window.continentData`, via `startNameAllMode(region)`) **and** all 5 state-level maps (US/India/Germany/England/Mexico — each borrows its `quizList`/`dataObjKey`/`useGlobe`/`mapUrl`/`mapObject`/`itemLabel(Plural)` wholesale from that mode's own `QUIZ_MODES` entry, same pattern as `startIdentifyMode`). `renderNameAllMode()` reads `modeConfig.itemLabel(Plural)` generically for its text (not hardcoded "country"), and guards `projection.rotate()` behind `typeof === 'function'` since AlbersUSA (`us-states`) has no `.rotate()` method. |
| `population-order` | Drag 5 countries into population order (high → low) |
| `mystery-flag` | A flag is shown — click the globe to find the matching country |
| `capitals-race` | A country is highlighted — type its capital to score |
| `country-shape-id` | Only the target country's outline is shown as a flat Mercator silhouette (no globe/neighbours/lakes/dots; **10m** max detail, borderless `.shape-target` fill, projection fitted to the country; only the single target path is drawn — `drawCountries` skips the rest) — pick its name from 4 choices (`countryShapeIdMode`). The 2 wrong answers are the most **shape-similar** quiz countries (`generateShapeIdOptions`/`shapeSimilarNames`): a size/aspect/compactness descriptor (`computeShapeDescriptor`, cached in `shapeDescriptorCache`), z-scored with size down-weighted since the silhouette is fitted to fill the view |
| `find-capital` | A capital name is shown — click the static world map to drop a guess marker, Submit; scored by total great-circle distance over X rounds (`findCapitalMode`) |
| `spaceship` | A photographic low-Earth-orbit view: a **three.js** textured globe (NASA Blue Marble — low-res base sphere + per-round full-500m-res cap tiles, see the textures note) through a perspective camera over a random coastal sub-point, tilted toward the shore so the curved horizon sits in the upper third. **Altitude tunable ≤500 km** via the Orbit-height slider (`orbitAltitudeKm`); `orbitDistance()`=(R+h)/R with the default tilt (`defaultOrbitTilt()`) + pan clamp (`clampOrbitTilt()`) derived from it. **Drag to look around** — grab-style (the point under the cursor sticks; FOV-derived sensitivity) about the fixed sub-point. Guess the sub-point on the **scroll-zoomable** inset map (`d3.zoom`), Submit; **scored** by accuracy + speed − panning with slider-tunable weights (`scoreAccuracyWeight`/`scoreSpeedWeight`/`scorePanWeight` + scales). Inset guess/answer pins + the connecting line use `vector-effect: non-scaling-stroke` and a `1/k` radius so they stay a **constant on-screen size** as the inset is zoomed. The `makeAtmosphere` shader fades **in both directions away from the limb** — up into space *and* down across the earth's disc — with no hard shell edge. Its axis is each ray's **signed tangent altitude**: closest approach to the centre, minus 1, so it's positive while the ray clears the limb and negative once it cuts into the disc. That is normalised to `0` = `uSpreadSpace` above the limb → `0.5` = the limb → `1` = `uSpreadEarth` below it — the two sides scale **independently**, each with its own slider-capped reach (space ≤600 km via `atmoSpreadSpaceKm`, earth ≤1500 km via `atmoSpreadEarthKm`, since the ground haze a photo shows reads much further than the thin optical glow above the limb), and shaded by a **user-editable 5-stop gradient** (`atmoStops`: space / horizon-blue / **horizon** (fixed) / horizon-white / earth, each with colour + alpha) via chained `smoothstep` mixes over GLSL uniform arrays (`uPos[5]`/`uA[5]`/`uC[5]`). The middle **"Horizon" stop is pinned at pos 0.5** (`fixed: true`) — `setAtmoPos` no-ops on it and `buildAtmoEditor` skips attaching its drag handler entirely — so there's always an explicit anchor colour exactly at the limb regardless of where the two flanking stops are dragged. The space-side distance→position mapping is always **linear**; the earth side can instead warp through a bounded **tangent curve** (`uEarthTangent`, the "Tangent earth fade" checkbox in Settings — `tan(x·60°)/tan(60°)`, capped at 60° rather than 90° to stay finite) purely to compare the two shapes. Blending is **additive** — that's what lets one gradient serve both sides (blue reads as glow against black sky, white reads as haze over lit ground) and makes alpha mean intensity; `depthTest:false` + `renderOrder 1` are required or the earth would occlude the shell and clip the fade at the silhouette. Colours are raw sRGB `Vector3`s, **not** `THREE.Color` — colour management would convert them to linear, but a ShaderMaterial gets no output-conversion chunk, so raw sRGB is what makes the render match the swatch. No `uCamDist`: the band is anchored to tangent altitude, so it stays put as orbit height changes. Edited in Settings ▸ Spaceship by `buildAtmoEditor`/`setAtmoPos`/`applyAtmoUniforms` (a preview strip over black is an exact match for additive-over-space; stops are held `ATMO_MIN_GAP` apart because `smoothstep` is undefined when its edges coincide). A **Country-outlines hint** (`#hint-outlines-toggle` button, spaceship-only, in the **controls bar** — not Settings; `setOrbitalHint`/`orbitalHintOn`) overlays white country borders on the globe: `loadHintFeatures` fetches the **50m (medium-detail)** countries (simplified with `MEDIUM_SIMPLIFY_RETAIN`, shares `worldTopoCache`), `buildCountryLinePositions` turns them into border segments on the sphere at `HINT_RADIUS` **1.001** (just above the surface; each arc slerp-subdivided so long spans hug the ground), rendered as **fat lines** (`three/addons/lines` `LineSegments2`/`LineMaterial`, exposed as `window.THREE_Lines` via a separate dynamic import so a CDN failure can't block `window.THREE`; falls back to 1px `LineSegments` if the addon didn't load) with `resolution` kept in sync by `syncHintResolution`. Aligned to the texture via `surfaceNormal`, the opaque earth hides far-side lines by depth test. On **mobile** (`orbitalMobileSplit`, ≤768px + `body.spaceship-active`) the view **splits**: the earth canvas fills the top and the inset becomes a full-width map below it (`orbitalResize` reserves the inset height). Renders on its own WebGL canvas over the hidden `#globe` SVG (sized from the container in `orbitalResize` — measure the container, not the replaced canvas, or it runaway-zooms). Renderer: `ensureOrbital`/`orbitalSetTarget`/`orbitalLoadCap`/`drawSpaceshipView`, disposed via `disposeOrbital` |
| `skyline-id` | **Hidden from the menu** (photo pool not yet vetted) — the mode, data, and CSS are all intact; only its 3 entry points (top-bar icon in `index.html`, landing card in `index.html` **and** in `resetModeSelector()`'s template in `game.js`) are HTML-commented out. Reachable directly via `startGameWithMode('skyline-id')`. Uncomment those 3 blocks to bring it back. A real photograph of a large city's skyline — name the city from 4 choices (`skylineIdMode`). **No map at all.** Photos are fetched live from **Wikimedia Commons** (`commonsSearch`; CORS-open via `origin=*`, and every file carries machine-readable licensing). `skylineLicenceOk` keeps only PD/CC0/CC-BY/CC-BY-SA — NonCommercial, NoDerivatives and unrecognised licences are dropped — and the photographer + licence + Commons link are shown **only after the round is decided** (`revealSkylineCredit`, called from `handleCorrectAnswer` and `giveUp`), because the file title almost always names the city. `skylineQuery` appends the state/country from the entry's `label`: without it `"Toledo" skyline` returns Toledo **Spain** above Toledo Ohio, and `"St. Petersburg"` lands in Russia; the term costs ~5% of hits and fixes the wrong-city answers. `skylineCandidates` drops non-photos (SVG/portrait/maps/logos) and *ranks* rather than rejects on whether the title names the city. Whether a city has a usable photo is only knowable after searching, so `resolveSkylineTarget` retries with another city on a miss and remembers barren ones in `skylineNoPhoto`; it reserves its pick in `usedCountries` **before** the search returns so `prefetchNextSkyline` (which resolves the next round in the background — a search takes 0.5–6 s) can't collide with a live pick. Distractors are ranked by `skylineDistractorScore`: same country dominates, then same region, then closeness in **log** population — so Abidjan draws Addis Ababa/Casablanca/Alexandria, never a suburb. Options are display `label`s, not keys |

## UI Structure

### Top Bar (in-game)
Single thin bar with: title | mode icons | score display. Two dropdown groups:
- **Find (🔍)** — expands to: World, USA, India, Germany, UK
- **Identify (❓)** — expands to same 5 geos
- Direct icons: ⌨️ name-all, 📊 population, 🚩 mystery-flag, 🏛️ capitals-race

The top-bar title (`#home-link`) **and** the big landing-page title/logo (`#landing-header`, `cursor:pointer` in CSS) both call `goHome()` — the header always works as a link back to the mode selector, from any screen it's visible on (landing page, in-game, any sub-selector).

### Mode Selector (landing page)
Full-screen card grid. "Find on the Map" and "Identify" open sub-selectors for region choice. Both sub-selectors carry a **scope toggle** (`scopeToggleHtml`, delegated click handling on the persistent `#mode-selector`) letting the player choose **All** vs **Random 10** questions before picking a region — `findQuizScopeAll`/`identifyQuizScopeAll` (module-level, persist for the session; Find defaults **All**, Identify defaults **Random 10**, preserving each mode's pre-toggle default). Find applies it via `applyQuizScope(mode, findQuizScopeAll)` (mutates `QUIZ_MODES[mode].totalQuestions`) right before `startGameWithMode`; Identify folds it into `startIdentifyMode`'s existing `Math.min(10, …)` computation.

### Globe-mode layout
Every `useGlobe:true` mode except `spaceship` (which keeps its own bespoke inset/mobile-split layout) maximises the map: `startGameWithMode` toggles a `globe-side-layout` class on `.container` based on `modeConfig.useGlobe && !modeConfig.spaceshipMode` (cleaned up in `goHome()`). `#map-container` and a `#globe-side-panel` wrapper (holding `#question-container` + `#multiple-choice-container`) are nested inside a new `#globe-layout` wrapper in `index.html`; `.globe-layout`/`.globe-side-panel` default to `display: contents` (a no-op — children behave as direct `.container` children, exactly the pre-existing layout) and only become a real `flex` row/narrow-column (map ~3fr, panel fixed 300px, collapses to a stacked column under 1024px) when `.globe-side-layout` is present. `countries` mode's separate `world-quiz-layout`/`world-quiz-globe`/`world-quiz-panels` system (2/3+1/3 split) got the same treatment via a flex-ratio tweak (globe `flex:1`, panels fixed `300px`, restoring `flex:1` on panels under the existing 1024px breakpoint since flex-basis governs height once that breakpoint flips the layout to a column).

### Score sync
`syncScoreDisplay()` keeps the top-bar inline score in sync with `gameState`. Called automatically after every score/question update.

## Answer pacing

One constant, `ANSWER_PAUSE_MS` (default 1200ms, Settings ▸ Gameplay slider), paces every quiz mode's reveal/advance sequence — replacing what used to be a dozen independent hardcoded delays (650/800/1000/1200/1400/2500ms) scattered across `handleCorrectAnswer`/`handleIncorrectAnswer`/`handleFlagChoiceAnswer`/`handleCapitalChoiceAnswer`/`handleCountryClick`/`giveUp`, several of which weren't tracked by the shared timer at all (so a fast mode-switch mid-pause could fire a stale callback against new state).
- **Correct answer:** pause `ANSWER_PAUSE_MS`, then advance (`handleCorrectAnswer`, branching on `subQuestionIndex < maxSubForMode(modeConfig)-1` for a sub-advance vs a full `goToNextQuestion()`).
- **Wrong answer:** pause `ANSWER_PAUSE_MS`, reveal the correct answer **alongside** the wrong one (`scheduleWrongThenCorrect` — `handleIncorrectAnswer` no longer self-clears the wrong highlight; the whole button/shape grid is rebuilt fresh for the next question anyway, so nothing needs to explicitly clear it), pause `ANSWER_PAUSE_MS` again, then advance unscored (`handleCorrectAnswer(el, false)`).
- **Distance/score-based rounds** (`find-capital`, `spaceship`, `population-order`) have no discrete right/wrong to reveal, so they get a single `ANSWER_PAUSE_MS` pause after the result is shown (`scheduleAutoAdvance()`, called from `revealCapitalAnswer`/`revealSpaceshipAnswer`/`checkOrderingAnswer`) — the relabelled Next/"See Results" button still works as a manual skip (`goToNextQuestion` calls `clearAutoAdvance()` first, so a manual click can't race the timer).
- **Give Up** (`giveUp()`) now auto-advances for every mode via the same mechanism — previously several mode-specific blocks (`skylineIdMode`, `capitalsRaceMode`, the generic tail's final-subquestion case) only enabled the Next button and waited for a manual click.
- Fixed along the way: `checkOrderingAnswer` used to increment `gameState.currentQuestion` itself *and* rely on the shared Next-button handler's `goToNextQuestion()` incrementing it again — a genuine pre-existing bug that made `population-order` skip every other round (10 configured rounds played as 5). It now only calls `scheduleAutoAdvance()`, incrementing exactly once via `goToNextQuestion`.
- `autoAdvanceTimer`/`clearAutoAdvance()`/`scheduleAutoAdvance(delay = ANSWER_PAUSE_MS)`/`goToNextQuestion()` remain the shared primitives; every reveal/advance path in the file now routes through them (or a bare `setTimeout` using `ANSWER_PAUSE_MS` explicitly) rather than an ad-hoc literal.

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
- `handleCorrectAnswer(element, award = true)` — awards point (unless `award:false`, used to reveal-and-advance after a wrong pick without scoring it), auto-advances sub-questions after `ANSWER_PAUSE_MS`
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
