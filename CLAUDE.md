# Geoquiz

Interactive geography quiz game built with vanilla JS and D3.js.

## Architecture

- `index.html` — single-page app; all game UI lives here
- `game.js` — all game logic (~7900 lines)
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

Dots are **rebuilt from scratch** by every `drawCountries()`, so anything painted onto them (the `target`/`found` classes, the `flag-filled` pattern fill) is lost on a redraw unless it is explicitly carried across. `captureFeatureMarks()`/`restoreFeatureMarks()` snapshot the class + inline `fill`/`stroke` of both the country paths **and** the dot circles, and are used by the two redraw paths that must not disturb the game in progress: `reloadWorldDetail()` (detail toggle) and `reprojectMap()` (globe↔flat toggle). Both previously restored path *classes* only — so changing detail cleared the flag fill of every already-guessed island (and `reprojectMap` wiped the dots wholesale).
- `DOT_PIXEL_THRESHOLD` (min dot px, 0–20) and `DOT_SPACING` (dot spacing) are exposed as live tuning sliders; `MEDIUM_SIMPLIFY_RETAIN` (20%) and `MIN_LAKE_DIAM_KM` (32 km) are locked constants, no longer sliders. All tuning sliders (general + spaceship) live in a **Settings pop-up** (`#settings-overlay`, opened by `#settings-btn`), not inline in the controls bar; the `#spaceship-tuning` group inside it is shown only in spaceship mode. A **Gameplay** group holds `ANSWER_PAUSE_MS` (see Answer pacing, below).
- The orbital `spaceship` view renders on its own **three.js** WebGL canvas (not D3/SVG) — see the `spaceship` row below.

## Shape framing core

A country's bounding box is only as tight as its most remote scrap of land, and several countries own a rock thousands of km from everything else — South Africa's Prince Edward Islands (0.02% of its area, 1400 km SE), Norway's Bouvet Island (Southern Ocean), Ecuador's Galápagos, mainland Netherlands vs Bonaire, France vs French Guiana. Fitting a silhouette to *that* box shrinks the country itself to an unreadable blob. `shapeFramingCore(feature)` returns only the polygon parts worth framing; the **full** geometry is still what gets drawn, so it acts as an invisible bounding box and excluded parts simply fall outside the viewport. Used by `renderCountryShapeIdQuestion` (both the `rotate` and the `fitExtent`) and by `computeShapeDescriptor` (so aspect/compactness describe the recognisable country, not its outlier-stretched box).

The rule grows outward from the largest landmass, biggest part first: a part joins the core if it rivals the main mass (`CORE_BIG_PART_FRAC` 25% of it) **or** is at least `CORE_MIN_AREA_FRAC` (0.5%) of the country's area *and* within `max(CORE_MIN_GAP_KM 200, extent-of-core-so-far)` of what's accumulated. Testing against the **growing** box rather than just the main part is what keeps genuinely strung-out countries whole (Indonesia reaches Papua island by island, Malaysia keeps both halves, the USA keeps Alaska). Bounds are measured relative to the main part's centroid longitude (`partRelBounds`) so an antimeridian straddle reads as one continuous span. A final guard: if the core holds under `CORE_MIN_KEPT_FRAC` (60%) of the area, the country genuinely *is* a scatter (Kiribati) and the whole feature is used unchanged. Measured over the 10m atlas this reframes 28 quiz countries — Mauritius ×18, Netherlands ×12, France ×5.8, South Africa ×2.1, Ecuador ×1.8, Japan ×1.4 — and Kiribati is the only fallback.


## Framing overrides, and the sandbox that makes them

`shapeFramingCore`'s rule is right most of the time and hopeless in a handful of cases, and no
threshold fixes them. Norway is the clearest: Svalbard is a real, large, permanently-populated
part of Norway 1,650 km north of the mainland, so it clears every test the rule has — and
including it stretches the frame across **22.5° of latitude**, which on a Mercator leaves the
mainland a ribbon at the bottom. (At 10m it is worse still: Norway also owns Bouvet Island in the
Southern Ocean, and the raw feature spans **135°**.) Indonesia reaching Papua island by island is
geometrically the same situation; the two differ only in what a person expects to see. So there
is a table of exceptions, `SHAPE_CORE_OVERRIDES`, consulted at the top of `shapeFramingCore` so
every caller (the fit, the shape descriptor, the flag pattern) agrees.

**An override has three forms**, and `corePartKept` is the single predicate all three go through,
so the sandbox's preview and the real framing cannot disagree about what one means:

    { box: [w, s, e, n] }    keep parts that lie WHOLLY inside this lon/lat box
    { maxKm: n }             keep parts within n km of the main landmass
    { drop: [[lon,lat], …] } exclude these by centroid, within CORE_OVERRIDE_TOL degrees

A box and a distance are both resolution-proof, which a centroid list is not: Svalbard is one
polygon in nobody's atlas — six at 50m, dozens at 10m — so an enumeration has to be rewritten
whenever the source changes, while "inside this rectangle" and "further than 700 km" are the same
fact at every resolution. `'Norway': { maxKm: 700 }` takes the frame from 135° of latitude to
**13.1°**, and 120 parts to 2.

The box tests the part's **bounds, not its centroid**. Half a country hanging out of the frame is
exactly what the frame exists to prevent, and a centroid test lets a long island through on the
strength of its middle.

**Sandbox ▸ Shape Framing** is one control: the box. Drag its corners; anything not wholly inside
is cut, and cut parts stay drawn faintly, because a part that has been cut *and* has vanished
tells you nothing about whether cutting it was right. The map is fitted to the **whole country**
and left alone while you drag — a frame that refits under the hand cannot be aimed — and the
sandbox runs at **10m** (`sbHiRes`), since the outline is the thing being judged.

That is deliberately less than it used to do. There were three ways to switch individual parts in
and out, and then a `framingDeriveRule` that worked backwards from the selection to whichever
rule reproduced it. But the box is the only thing an override actually produces, so everything
else was editing a proxy for it: now the rule *is* what you are drawing, and *Save override*
writes the rectangle verbatim.

**Overrides are saved** to `localStorage` immediately (so a change is in force on the next
reload) and to `data/shape-core-overrides.json` via *Download all*, which is the only sense in
which anything is permanent. `loadCoreOverrides` reads the file as the baseline and lays local
edits on top, so a country you have overridden yourself is not quietly reverted by a fresh
checkout. A box that cuts nothing is not saved at all — that is the default, not an override.
Saving also clears `shapeDescriptorCache` — which is **null**-when-invalid, not empty-object,
since an empty object is truthy and would be used as a finished cache.

**The panel ranks every country by how much of its own bounding box it fills**, worst first,
which is how you find a bad framing instead of stumbling on one. Below 5,000 km² the number stops
having a numerator — at 50m the atlas rounds Andorra and Monaco to an area of nothing, so every
microstate reported 0% and filled the list with countries that have no framing problem at all.
Above the floor it reads: Bahamas 2.2%, Solomon Islands 3.3%, Vanuatu 4.3%, Japan 16%, Norway 18%
(already improved by its override), Indonesia 18%, Chile 22%, Morocco 23% — and Morocco has one
part, so it is a diagonal country rather than a fixable one, which the parts count says at a
glance.

Note the override only *restricts* what the rule may consider; the rule still runs on top. Box
four parts of Japan and the frame may keep one, and the panel re-opens on that live result rather
than on what the box held.

Fixed at source on the way: **`featureParts` now accepts a bare geometry as well as a Feature.**
`shapeFramingCore` *returns* a bare MultiPolygon — except when it abandons the core for a genuine
scatter, when it returns the whole **Feature** — so anything asking for the parts of a core it
had just computed was silently getting an empty list, which reads as "this country has no parts
at all".

## US States Puzzle

The whole interaction rests on **one coordinate trick**. Each tray piece is its own `<svg>` whose `viewBox` *is* that feature's projected bounding box, expressed in board user units — so `d3.pointer(event, pieceSvg)` returns the grab point already in **board** coordinates. The misplacement of a drop is then just `cursor-in-board-coords − grab-point`: no CTM arithmetic, no bbox bookkeeping, and it stays correct however the tray happens to be scaled by CSS. `puzzleDropOffset` is that one subtraction, and it's the whole snap test. `boardScreenFrame()` (origin + px-per-unit, read live off the viewBox and client rect) is the only bridge back to screen space, and only the ghost's placement uses it.

### The world board's per-piece Mercator

On a Mercator a shape's distortion is decided entirely by *where it is*, so a piece cut from the board and parked in a tray is a lie — Greenland in the corner is drawn at Greenland's latitude whether or not that's where you think it goes. On the **world** board (`puzzleDynamicMercator()`, i.e. `mapObject === 'countries'`) each piece therefore carries its own scale.

The whole correction is **one uniform scale in projected space**, about the point being dragged: Mercator's scale factor is `1/cos φ` in *both* axes, so the same shape at latitude b instead of a is that shape at `cos(a)/cos(b)` times the size (`puzzleLatRatio`), rendered as `translate·scale` on the board path (`puzzlePieceTransform`, `puzzleScaledBounds`). Parked in the tray a piece is scaled to the equator (cos of its own centroid latitude); dragged it grows and shrinks live with the cursor's latitude; dropped where it belongs the ratio is exactly 1 and the transform is a literal `translate(0,0) scale(1)` over the board's own path string — an identity, not an approximation.

**This replaced a great-circle carry** (`carryFeature`, two composed `d3.geoRotation`s) and the reason matters: a sphere rotation only preserves north-up *at its anchor*, so the further a point sat from that anchor the more it skewed — meridians stopped being vertical and the piece visibly wobbled. It also re-projected the geometry each frame, which meant a piece dragged over the tray (board x > width → lon > 180°) **wrapped across the antimeridian and split into a phantom copy**. The projected-space scale has neither problem: nothing is re-projected, the path string is fixed, so verticals stay vertical, the aspect ratio is preserved exactly (Norway 0.601 board / 0.601 tray, Canada 0.767 / 0.767, Kenya 1.00 / 1.00) and wrapping is not expressible.

The grab is un-scaled the same way: the tray piece is drawn scaled about its projected centroid (the ratio and centroid ride along as `data-scale`/`data-from`), so dividing the grab point back out gives where on the board it belongs. The scale reference is the **grabbed point's** latitude, not the centroid's — that is what makes a correct drop exactly 1. `PUZZLE_CARRY_LAT_MAX` (78°) clamps the latitude the ratio may read, since Mercator runs to infinity at the poles. Blind mode records `{from, to, scale}` alongside the drop vector so `commitBlindPlacement`'s feedback and `revealBlindPlacements` redraw the piece as it actually looked at release; every other board keeps the plain translate (ratio 1 throughout).

`puzzleSnapRadius` (Settings ▸ Map, default 24) is therefore in **board user units**, not screen pixels. The board's viewBox is a fixed 800×600 whatever size it renders at, so a snap is exactly as forgiving on a phone as on a desktop — verified identical at board scales 0.44 and 1.11. `puzzleBoardScale()` (screen px per board unit, the smaller of the two `meet` ratios) is used *only* to size tray pieces and the drag ghost so they visually match the board; no snap maths depends on it, which is why a stale scale can never desync a drop.

`PUZZLE_DIFFICULTY` drives everything that varies: `board` (`slots` vs `silhouette`), `labels`, `snap` (a multiplier on `puzzleSnapRadius`), `showHit`, and `blind`. `puzzleRules()`/`puzzleActiveSnap()` are the only readers — nothing else branches on the difficulty string.

| | Board | Snap | Hit cue | Scored on |
|---|---|---|---|---|
| easy | outlined + named slots | `1×` (24) | green | pieces placed |
| medium | silhouette only | `0.2×` (4.8) | none | pieces placed |
| hard | silhouette only | **none at all** | none | distance + time |

Easy and medium are snap-to-fit jigsaws; **hard is a different game** — see Blind mode below. Note `PUZZLE_DIFFICULTY.hard` carries no `snap` key whatsoever and `puzzleActiveSnap()` short-circuits to `0` on `blind`, so there is no radius to accidentally widen.

A placed piece is **named on the board** (`.puzzle-placed-label`, bold white with a dark halo so it survives both themes and the muted Solve-It fill), skipping anything under `PUZZLE_LABEL_MIN_PX` and all of blind mode, whose placements are wiped after the grading pause. The labels live in their own layer above `.puzzle-placed-layer` so a later neighbour's fill can't paint over an earlier name.

The board takes **no map drag at all**: `isStaticMapMode` now short-circuits the drag attachment in `setupGlobe` (it already guarded the wheel and touch handlers) and cancels the browser's native drag/select of the SVG, so a drag across the board is inert rather than panning the map out from under the pieces. This is belt-and-braces — `startStatePuzzleMode` also forces `useGlobe = false` for every region, which is what stopped the world puzzle rotating its globe on the first drag.

A piece snaps **only into its own slot** — the offset is measured against that state's real position, so a Kansas-shaped piece dropped over Nebraska is a miss (`puzzleMisses`), not a placement. Snapped pieces fill **green** (`--correct` at 0.62), so the board accumulates what you got right; Solve It's pieces stay muted (`.puzzle-placed.revealed`) and remain visually distinct. The board is static: `isStaticMapMode()` excludes it from wheel-zoom and touch-pan alongside find-capital and Shape ID, and no drag branch applies, so slots can't drift out from under the pieces.

### Blind mode (hard)

One state at a time against a bare silhouette, nothing snaps, and **nothing accumulates on the board** — that last part is the whole point, since a filled-in map would give every later state a reference. `refreshPuzzleTray` slices the queue to its head, and `onPuzzleDragEnd` diverts to `commitBlindPlacement` before any snap test.

Scoring is distance **and** time, on the same `exp(-x/scale)` curves as the spaceship view: `puzzleBlindPoints` splits `PUZZLE_POINTS_PER_STATE` (10) between an accuracy and a speed term via `puzzleScoreBalance` (%), with `puzzleDistScale` (km) and `puzzleTimeScale` (s) setting where each falls to ~37%. All three are Settings sliders. Each state's clock starts when it is *presented*, so the reveal pause doesn't cost the player anything.

`puzzlePlacementErrorKm` is the great-circle error: un-project the true centroid and the dropped point and measure between them. `d3.geoAlbersUsa` is a **composite** and inverts to `null` in the dead gaps between its insets, so there's a fallback that estimates km-per-board-unit locally at the true position. One consequence worth knowing: the Alaska/Hawaii insets are drawn at a compressed scale, so the same pixel error there is a genuinely larger real-world distance (20 units ≈ 502 km on Alaska vs 176 km on Texas). That's geographically honest, which is what "great-circle distance" asks for, but it does make the inset states harsher.

Feedback is the only thing the player gets back: the state is drawn **where they dropped it**, tinted by `puzzleErrorColor` (green → amber → red, ceiling `puzzleDistScale × 4`, theme vars read live so both palettes work), held for `ANSWER_PAUSE_MS`, then removed before the next state is handed out. That pause runs on a *tracked* `puzzleDropTimer` — a restart or mode switch mid-pause would otherwise fire the advance against fresh state. `revealBlindPlacements` then ends the round with the map the player actually built: every state at its own drop position, still carrying its grading colour, over faint leader lines back to where it belonged.

**Pieces live in a tray**, in `#globe-side-panel` — so the puzzle opts into the existing `globe-side-layout` (as Places-been does for its category lists) despite not always being a globe mode, and inherits its 1024px collapse to a stacked column for free. `buildPuzzleTray` creates the shell once and wires ONE delegated `pointerdown` on `#puzzle-pieces`, because `refreshPuzzleTray` rewrites that strip’s innerHTML after every placement. Tray pieces are sized from their own board footprint (`puzzleBoardScale`) and then clamped to `TRAY_PIECE_MIN`..`TRAY_PIECE_MAX` (24–78px), so relative sizes read but Rhode Island is still grabbable. The order is shuffled **once per game** and then held — reshuffling on each placement would move the remaining pieces out from under the player’s hand. In blind mode the strip is sliced to its head, so exactly one piece is on offer at a time.

Colour is the whole legend and the three states never share one: **slots** are recessed grey holes, **tray/ghost** pieces are warm amber with a dark outline, **placed** pieces are green. `puzzleSnapRadius` defaults to **24** board units.

A placed piece animates in from where it was actually dropped — offset by the drop delta and 1.12× oversized, easing to true position and size. The `settle` cleanup is bound to `end interrupt cancel` **and** a plain `setTimeout`: d3 transitions are rAF-driven, so a backgrounded tab would otherwise strand the piece permanently offset and oversized *on the board*. `setTimeout` still fires when rAF is throttled, which makes the correct final state unconditional. `prefers-reduced-motion` skips the animation; `playPuzzleClick` synthesises the snap sound (a decaying noise burst through a bandpass — no asset), lazily creating the `AudioContext` inside a pointerup/button handler so autoplay policy lets it start. Settings ▸ Map has an off switch. Solve It skips both per-piece (fifty overlapping clicks and animations would be a mess) and plays one click for the lot.

The drag ghost's wrapper sets `line-height: 0` and its `<svg>` `display: block`: an inline SVG sits on a text baseline, which made the wrapper 4px taller than the piece and hung it that far below the cursor.

`drawCountries()` early-returns into `drawPuzzleBoard()`. Hard mode's silhouette needs **no union geometry** — filling every state with no internal stroke renders the union for free (a hairline stroke in the *same* colour as the fill closes the antialiasing seams along shared edges). Easy names each slot but skips any under `PUZZLE_LABEL_MIN_PX` (20 units), since a centroid label inside Rhode Island is illegible mush. `puzzlePieceFeatures()` filters to quiz-list states with **finite** bounds: `d3.geoAlbersUsa` drops everything outside the 50 states, so Puerto Rico (present in `usStates`, and the reason the list has 51 entries) projects to null and infinite bounds — it is silently unplayable rather than a broken piece.

The drag ghost is a `position: fixed` overlay on `<body>`, **not** a `<g>` inside the board SVG: the tray sits outside the map, so an in-SVG ghost would be clipped — and therefore invisible — for the whole first half of every drag. Its `viewBox` is nevertheless in **board units** and it is sized at the board's own px-per-unit (`boardScreenFrame`), so what you drag is pixel-for-pixel what will land — checked at board scales 0.99 and 0.44. `startPuzzleDrag` follows the `DragToReorder` conventions (listeners attached *before* `setPointerCapture`, which is wrapped in `try/catch`).

Scoring: `gameState.score` counts pieces the player placed themselves, `puzzlePlaced` is everything on the board, and "Solve It" (`giveUp` → `solveStatePuzzle`) fills the rest in via `placePuzzlePiece(name, false)` — rendered muted (`.puzzle-placed.revealed`) so the final board still shows what was actually earned. `puzzleRating` only applies its time-per-piece buckets when `earned === total`; a board finished by Solve It is rated on how far the player got instead, or the summary would call 3/50 "excellent". `endGame` has its own `statePuzzleMode` branch (the puzzle can't be *failed* — every piece ends up placed), which forks again for blind mode: points out of `total × 10`, average error, and `puzzleBlindRating`, which withholds praise unless the whole set was placed. In blind mode Give Up is relabelled "End Round" and simply ends it — there is nothing to solve, and unplaced states just go unscored.

Layout: the tray lives in `#globe-side-panel`, so the puzzle opts into the existing `globe-side-layout` (as Places-been does for its category lists) despite not being a globe mode, and inherits its 1024px collapse to a stacked column for free. `state-puzzle-layout` on `.container` only widens that panel. **Side-by-side is the right call because the board is height-constrained**: with a fixed 800×600 viewBox in a wide container the fit scale comes from the height, so width spent on the tray costs the map nothing until it narrows past ~870px, whereas a tray underneath eats the one axis that limits it. Measured at 1280×720: **0.99 board scale side-by-side vs 0.50 for the earlier tray-underneath version.** Under 1024px (where it stacks anyway) `body.state-puzzle-active` scopes an **exception to the app-wide `body { height: 100vh; overflow: hidden }`** so the page can scroll instead of crushing the board — on a 375px phone that keeps the map at 422px and board scale 0.44.

## Sandbox category

**The Sandbox is one flat grid.** There used to be a Quick Quizzes tile inside it that opened a
second grid of its own, so a short round — the whole point of which is that it starts fast —
took three clicks to reach. The quizzes are now sandbox tiles themselves, generated from
`SB_QUIZZES` by `sandboxQuizTiles()` so the registry stays the single source of truth. Two things
moved further, out of the drawer entirely and onto the **landing page**: **Who's Missing**
(`sb-missing`, which is why `sandboxQuizTiles` skips it) and **Sun & Moon**. Both are real
`QUIZ_MODES` keys, so the landing grid needs no interception for them — but the grid exists in
two places (static markup in `index.html` and `resetModeSelector`'s template) and both were
updated.

Newer, rougher modes sit behind one **Sandbox** tile (`science` icon) rather than cluttering the landing grid: Sun & Moon, Sun Path, Odd One Out, Draw the Border, Quick Quizzes (twenty-four of its own — see below), and the **Spaceship Sandbox, which moved here** from the orbit tile (`?mode=spaceship-sandbox` still works, and `showSpaceshipSelector` is now just Play). `SANDBOX_SUBMODES` + `showSandboxSelector()` follow the `FLAG_SUBMODES` pattern exactly; `sandbox` joins the six other **selector triggers that are not mode keys** and must be intercepted in all three dispatch points (`setupEventListeners`, `resetModeSelector`'s re-attach, `switchToMode`).

Two entries open **another** picker first: Draw the Border (`showDrawBorderSelector` → `startDrawBorderMode(region)`), since it runs over any geography, and Quick Quizzes (`showSandboxQuizSelector`), which holds twenty-four tiles of its own.

## Sandbox quizzes (Quick Quizzes)

Twenty-four short modes, almost all **derived at run time** from data already in the app. Areas and bounds from `d3.geoArea`/`d3.geoBounds`, adjacency and coastlines from the arc table, **border LENGTHS from `topojson.mesh` + `d3.geoLength`**, the solar round from the same series Sun & Moon uses, the lake round from the bundled Natural Earth lakes, and — the one exception — `data/airports.json`, a curated 148-airport set (IATA code, city, country, `[lat, lon]`) that Flyover needs because no airport data existed anywhere in the repo.

### Two from the second wave

Ten more were written and eight were cut again. The two that stayed are the two that could not
be answered any other way than by picturing the map:

* **Out of Scale** — four outlines at one shared scale, except one. It needs a genuinely
  **equal-area projection**: "the same scale" has to survive measurement, and a Mercator divided
  by cos(centroid latitude) does not, because the stretch varies across a country — Finland
  (60–70°N) came out 23% off while being drawn perfectly honestly. Azimuthal equal-area centred
  on each country makes drawn area exactly proportional to true area; rasterising the rendered
  tiles, the three honest ones share one km²-per-pixel to **0.6%** and the liar is off by 4.40×
  against an expected 4.34×. Candidates are within 3× of each other **pairwise** (filtering
  against the seed alone lets the extremes sit 9× apart, and then the odd one out is simply the
  biggest picture) and no more elongated than 2.6:1 — the question is about area, and Chile at a
  shared scale is a hair nobody can weigh against a blob. **On the reveal all four are brought
  onto one scale**: the scale at which the BIGGEST of them exactly fills its tile, with the
  others at their honest fraction of it. That is the largest scale at which all four still fit,
  so the comparison uses every pixel there is and nothing runs off its card. Normalising to
  whatever the largest DRAWN tile happened to be is not the same thing — when the lie was an
  over-scaled country, it made every honest one grow to match a size that was wrong to begin
  with. The cap is measured on what is DRAWN, not on the framing core: a country whose full
  geometry runs past its core (a remote islet) overflowed its card by up to 35% when the core
  set it, and with every tile on one scale that spills into the tile beside it. Verified over
  six rounds — one scale every time, the largest filling its tile exactly, nothing over.
* **Fewest Borders** — the shortest path between two countries, counted in crossings. Its
  adjacency is **not** `playableNeighbours`: that one is honestly topological and says France
  borders Brazil and Suriname, which is true via French Guiana and useless for a question about
  crossing borders on the ground (Spain to Brazil came out at two hops). At 110m the atlas ships
  France as one MultiPolygon with Guiana inside it, so there is no geometry to filter and the
  test has to be geometric: `sbLandNeighbours` keeps a pair only when their LARGEST parts'
  bounding boxes come within a degree. Measured across nine countries it drops exactly Brazil
  and Suriname from France and nothing else at all — Russia 14/14, China 14/14, India 6/6.

Deleted with the other eight: the `latitude` engine (Read the Daylight went too), the pin and
walked-track overlays, `sbCountryAt`, and the second-level Quick Quizzes picker.

`SB_QUIZZES` is the registry and the single source of truth: each entry carries its label/icon/description **and** a `build()` returning one round. `QUIZ_MODES` entries are generated from it in a loop, and `showSandboxQuizSelector` renders its grid from the same object, so adding a quiz means adding one key.

**`build()` returning `null` is the error-handling strategy.** A draw can fail for many ordinary reasons — no capital coordinates, a pair too close to call, a Mercator pair the projection does *not* mislead you about — and the renderer simply retries (up to 60) rather than each quiz special-casing its awkward cases. `sb-distance-order` succeeds on ~2 of 12 draws (it insists on 650 km between consecutive entries) and `sb-mercator-lie` on ~11 of 12; both are comfortably inside the retry budget.

Seven modes were **deleted** in the same pass — First Light, Zoom Out, Climate Band, Longest Border, More Coastline, Which Way Is North, The Wrong Capital — taking the `reveal` engine, `sbCoastKm`, `sbMapBearing`/`sbCompass`, `sbDrawNorthArrows` and `sbRenderPairOptions` with them.

Seven engines, chosen by `engine`:

| Engine | Interaction | Scoring | Quizzes |
|---|---|---|---|
| `fact` | highlight + 2–4 option MC | 1 per round, or 1 + a speed bonus where `speedBonus` is set | mercator-lie, great-circle, lake, missing, fake-flag, upside-down |
| `multi` | pick every one that applies | `10·(hits − false positives)/|truth|` | flyover, all-neighbours |
| `estimate` | log slider | `10·exp(−ln(ratio)/ln 6)` | estimate-pop |
| `order` | drag five | `calculatePairwiseScore/10` | distance-order |
| `pinpoint` | click the map | `10·exp(−km/scale)` | capital-pin |
| `latitude` | arc slider, 90°N–90°S | `10·exp(−°error/12)` | daylight-lat |
| `picker` | type-to-filter over every country | ratio-based, heavily penalised over the line | price-pop, price-area |

`fact` also carries three option renderers beyond plain text buttons — `imageOptions` (flags),
`shapeOptions` (silhouettes, each fitted to its own tile so size is never the tell) and
`routeOptions` (A–D buttons tinted to match their own line on the map).

### Board-replacing rounds

Three round-spec keys let a quiz take the board over entirely. `drawCountries()` hands off to
`sbCustomBoard()` before drawing anything, and `renderSandboxQuizQuestion` re-runs
`drawCountries()` for them because the map finishes loading *before* the first question exists.

* **`solo: {feature, kind}`** — one shape, alone, framed through `shapeFramingCore` (the same
  guard Shape ID uses: a country's box is only as tight as its most remote islet). Used by Every
  Neighbour, Pin the Capital and Name the Lake, all of which previously showed their subject on
  the world map — where the surrounding geography *was* the answer. The lake variant adds an
  inward blue fade, clipped to the lake so it cannot haze outward into land that is not drawn.
* **`coastOnly: true`** — coastlines and no borders at all, via the same
  `(a, b) => a === b` mesh filter Draw the Border uses. Flyover's board.
* **`surgery: {gone, features, absorbers}`** — see Who's Missing below.

Note the dots and the lake overlay are **siblings** of `countriesGroup`, not children, so
emptying it leaves both behind — and a field of dots around a lone silhouette is exactly the
surrounding map these rounds exist to remove.

**`fitExtent` works in PROJECTION units, which are the SVG's viewBox units, not client pixels.**
The svg is viewBox-scaled, so measuring it with `clientWidth` overshoots the fit by the display
ratio and pushes the shape off the edges — which is exactly what made Pin the Capital look broken.

### Who's Missing

A country is removed and its land handed to its neighbours. The surgery happens at the **arc
level**, which is what makes it invisible: TopoJSON stores each shared border once and both
countries point at it, so rewriting one arc moves exactly one border and leaves every other
vertex of every other country **bit-identical**. An absorber's own arc is replaced by the whole
outline of the land it has taken, and the borders inside that outline which did NOT move (a
coastline, a crowded-out neighbour's border) are copied verbatim, so they are drawn twice in
exactly the same place and no seam can open. Everything is deterministic — the same country
always divides the same way.

**Coastal countries divide too**, which matters because 151 of the world's countries have a
shore and the earlier version could only eat the 40 that don't. A border that cannot move simply
stays put and whoever is opposite comes all the way in to it. The only structural requirement
left is one land neighbour: an island has nobody to give the land to.

**The fewest neighbours holding 80% of the land border take it** (`SB_ABSORB_COVER`), longest
border first; the rest are crowded out, which is what a small neighbour of a big one looks like
anyway and keeps the division legible instead of shattering a country into eight slivers.

**The land is divided along a guide axis** — the longest straight segment that fits inside the
country, found by scanning 36 directions × 24 parallel chords and keeping the longest interior
interval. Each tripoint runs a spoke in to a point on that axis, and two absorbers meeting meet
*along* the line rather than at a point. That is the entire reason for it: an earlier version
sent every border in to the country's pole of inaccessibility, which tiles perfectly and looks
wrong, because seven borders converging on one spot is a thing that exists nowhere on earth and
Burkina Faso's neighbours all met in a visible starburst.

Three things the construction has to get right, each of which was wrong first time and each
caught by an audit rather than by looking:

* **The feet go round the axis in the same cyclic order as their tripoints go round the
  boundary**, forced monotonic. Feet at the *nearest* point of the axis do not: at Germany's
  eastern tip the nearest point lies along the Czech border, so the spoke ran parallel to the
  border it was meant to be cutting away from. With the order guaranteed, tiling is a property
  of the construction rather than a hope.
* **A straight spoke is not always inside the country.** From the tip of the Zittau salient the
  direct line to the middle of Germany leaves through the neck and comes back, so the border it
  drew ran 30 km through Czechia. Each spoke therefore tries a series of curves — bowed along the
  axis, then swung out along its tripoint's **interior angle bisector**, which at Zittau points
  straight up the salient, i.e. the way you would have to walk — and takes the least swing that
  stays on home soil. That one change took the pass rate from 101 countries to **125**.
* **The axis collapses to a point as a fallback** (`frac` 1 → 0.55 → 0.25 → 0), which is the old
  fan. A country whose neighbours surround it on all sides has no long axis worth dividing along,
  and degrading to a fan is the right answer rather than a failure.

The tripoint's inward direction is the **interior angle bisector**, not the normal to the
boundary: a tripoint is a corner, the normal is undefined at one, and taking the average tangent
instead sends the new border straight back across the old one within a few hundred metres.

Two audits, and they catch different things. Every region loop is checked for
**self-intersection** — a fold through another absorber's frontier is exactly what an area total
cannot see, since one gains what the other loses — and the finished geometry is **area-audited**
against the vanished country to within 3%, testing what will actually be drawn rather than a
proxy for it.

**Islands of the vanished country go whole to the nearest absorber**: there is nothing to divide,
and a rock left ownerless is a hole in the map exactly like the country was.

Measured over the 191-country pool at 110m: **125 divide cleanly**, 18 are islands with no land
neighbour, 22 are too small to have a boundary worth cutting, 4 contain an enclave, and 17 will
not tile under any of the twelve axis attempts. Within the quiz's own size band that is **102 of
117**. Spot-checked on eight countries, coastal and landlocked: identical output on repeat runs
every time, area conserved to **99.7–100.3%**, and every untouched country bit-identical (195/196
for Germany — the one exception is Australia, whose antimeridian ring re-decodes differently
because the rebuilt topology carries absolute coordinates rather than a quantization transform).

Candidates must be at least **twice the area at which the map would draw them as a dot rather
than an outline** (`SB_MISSING_MIN_KM2`) — "which one is missing" is not a question about
something that was never visible — and under 900,000 km².

Answers come from a **filterable list of every country**, not from four options
(`pickOne` on the spec, rendered by `sbRenderPickOne` — the picker engine's chips wired to the
plain right/wrong handler). Four options made this a question about the distractors: three of
them were visibly still on the map, so the round collapsed to "which of these four can I not
see". The chips carry `option-btn` as well as `sb-pick-btn` so the shared wrong-answer reveal
can find the right one by text — which is also why answering clears the filter and repaints the
full list first, then scrolls the answer into view.

**The eaten country is absent from `gameState.countries`, not hidden.** Everything else — dots,
lakes, highlights, clicks — then behaves normally with no knowledge of the surgery.
`gameState.sbWorldBackup` restores the real world before the next `build()`. Two things that has
to be paired with:
* **`drawIslandMarkers` must skip it by name.** The country is still in the quiz list, and the
  no-polygon fallback plants a dot at `capitalCoords` for anything in the list without a feature
  — putting a marker exactly where the answer used to be.
* **`drawCountries` needs a full join.** It was enter-only, which is invisible while the group
  starts empty (the normal case) and silently wrong the moment it runs twice against a changed
  feature list: `enter()` is empty, so the existing paths keep their old `d` and the new geometry
  is never drawn.

The board is **not** zoomed — framing the neighbourhood named the answer. The player zooms, and
the round is scored on the clock (`speedBonus`).

`sbEatWhy` records which rule refused an attempt (`island`, `enclave`, `twoplaces`, `tiny`,
`divides`), so the sandbox can say what stopped it instead of shrugging.

### Spot the Fake Flag

The fake is a **real flag with its colours changed**, fetched from flagcdn and recoloured in SVG.
Two things gave the old canvas generator away: it was a 320×213 **raster** beside three vector
SVGs (every flag in the app is fetched as `.svg`), so sharpness alone decided the round; and its
eight-layout vocabulary put a plain disc on screen constantly when exactly one country has one.

Colours are classified into perceptual **buckets** (near-identical hexes are the same colour for
this purpose) and replaced from the seed's own **region**, weighted by how common each is there —
so an African seed stays in the pan-African vocabulary. Three constraints, all of which were
wrong first time and all visible in a sample of draws:
* the mapping must be **injective** — two colours landing on the same one merges the shapes they
  distinguished, and Ethiopia's star dissolves into its field;
* **never map into white or black** — they are what emblems and outlines are drawn in;
* a replacement must be **≥90 RGB units away**, or the swap (navy for blue, maroon for red) is
  invisible at tile size and the round becomes "which one looks very slightly off".

Seeds are rejected when the design is simple enough that another real country might already own
the recoloured version — plain bi/tricolours are exactly that hazard (Ireland/Ivory Coast,
Indonesia/Monaco, Chad/Romania) — so a seed needs either an emblem's worth of elements or a
palette no plain tricolour has. ~35% of seeds are accepted; `sbPrepareFakeFlag` tries several per
preparation and always has the next one in flight, so no round waits on the network.

### Read the Daylight

An **arc slider** running 90°N to 90°S, graded on closeness — four options made this a recall
question about four numbers, and an arc says what latitude actually is. The reveal reuses Sun
Path's **Earth-in-space** pane: `buildEarthInSpace(scene, opts)` was extracted out of
`buildGlobeScene` (and `sunPathEarthCanvas`/`applyEarthTexture` out of
`refreshSunPathEarthTexture`) so it can be built against an explicit scene rather than
`sunPathState`. The pane tilts to the date's declination and rings both the true and the guessed
latitude, then spins the earth under them — the day/night share of each ring is something you
watch happen rather than infer from a still.

Notes worth keeping:
* **`multi` must subtract false positives.** Scoring hits alone makes "select everything" a perfect answer, which is the only thing that would make "pick all" not a question.
* **`estimate` marks the country's own bar on the reveal**, widened and in the accent colour
  with its flag planted on it. "A factor of three out" says nothing about *where* in the
  world's spread that sits, which is the thing the chart exists to show.
* **`estimate` puts its chart up from the first frame and moves it with the slider.** Held
  back until the answer it was a post-mortem; live it is the instrument you are reading — you
  can watch your guess climb past most of the world before committing to it. The truth rule
  stays hidden until you submit. The map's only job in that round is to say *which* country,
  which a small globe does as well as a large one, so `body.sb-wide-panel` swaps their share of
  the width (measured 431 px of map against an 830 px panel, from 3fr against a fixed 300).
* **`estimate` scores on the RATIO, not the difference.** Being two million out matters enormously for Iceland and not at all for India; a log error says so, a linear one does not. Its reveal plots every country as one bar on a log axis with the guess and the truth ruled across it, flagged at the ends by whichever countries actually hold the extremes (India and Vatican City) — never hardcoded.
* **`picker` scores on the ratio too, for the same reason.** The old `10·(guess/best)` paid ~0 for anything but the very top of the range, so a continuously-scored round read as all-or-nothing. Going over is still the failure — that is the Price-is-Right rule and the shape of the question — but it decays rather than dropping to a flat zero.
* **`sbScoreClass`** grades the feedback box green/amber/red. The continuously-scored engines have no right-or-wrong to report, and painting 6/10 red misrepresented them; `.feedback.partial` already existed and was simply never used here.
* **`sb-lake` holds its answers for the game.** There are only two dozen lakes worth asking
  about, so a ten-round set draws a repeat by chance more often than not; used ones are released
  only when the pool runs dry. Verified: no repeat in fourteen consecutive rounds.
* **Who's Missing shows its clock**, and what the speed bonus is currently worth. The round
  told you the clock was running and then hid it, which is the worst of both: the pressure
  without the information. Its reveal fits the map to **the country**, with a wide margin,
  rather than to the whole neighbourhood — fitting to every absorber framed the DRC or
  Kazakhstan and left the country that vanished as a speck in the middle — and outlines the
  hole in red, which is the only way to see what the neighbours took, because the seam is
  invisible by construction.
* **`sb-mercator-lie` asks only two kinds of question, and mixes them 50/50.** Either the
  projection **reverses** the comparison (the one that looks bigger is the smaller, ratio at
  least 1.25 so the reversal is legible) or the two are a **near-tie in real area** (within
  ~20%, where the map's stretch is bigger than the real gap and eyeballing gets you nothing
  either way). A pair where the map is right *and* the answer is obvious is not a question. The
  near-ties also have to be tempting — the equatorial one is the smaller, with an 18° latitude
  gap — so "pick the one nearer the equator" is exactly the move the round punishes. The split
  is made by **finding one of each and then tossing a coin**, not by tossing the coin first and
  searching for that kind: the near-tie rule is far harder to satisfy, so choosing first gives a
  lopsided mix that moves whenever either rule is touched (measured at 27% near-ties with a 0.45
  coin, 62% at 0.68, 36% at 0.60, all of them noisy). Searching for both is 50/50 by
  construction — verified at **48% near-ties with the equator shortcut winning 52%**, and **zero
  failed draws** in 50. Apparent Mercator size goes as `area/cos²(latitude)`, so the reversing
  draws only keep pairs where the bigger-looking country is the smaller one — the projection is
  the adversary, not the distractor list.

  **Its reveal (`sbRevealEquator`) takes the map away and CARRIES both countries to the
  equator, re-projecting every frame**, so each one visibly un-stretches on the way down. Carried,
  not scaled: a uniform scale by cos(latitude) is the right answer for a shape small enough to
  have one latitude, and this mode deals in Greenlands. Rotating the globe so a country's own
  centroid lands on the equator and re-running the Mercator is the honest version of the same
  move, and it is the one that shows the shape changing rather than only the size. Verified: the
  drawn area ratio at the end matches the true area ratio to within 3%, against a map ratio that
  had one of them looking nearly twice the other.

  Four things that construction has to get right:
  * **Rotate onto the prime meridian first.** A rotation by −φ about the y axis only lands a
    point on the equator if it is already at longitude 0, so rotating by latitude alone left
    Finland 220 px short of the line it was arriving at. Mercator's x is linear in longitude, so
    undoing that sideways rotation is one constant added to the translate — the shape keeps its
    own longitude, and at u = 0 the projection is pixel-identical to the live map's.
  * **Animate a decimated copy.** Re-projecting 10m geometry every frame is 63 ms for Canada,
    which is a slideshow rather than a motion; every nth vertex is 1.2 ms and, while the shape is
    travelling, indistinguishable. Full resolution goes back on the instant the carry stops,
    which is also the instant the shape is worth looking at closely.
  * **Draw the framing core, and only offer countries whose core IS the country** (within 8% by
    area). Norway's full geometry runs from Svalbard to Bouvet Island, so a pair fitted to it is
    two specks either side of 135° of empty latitude — and drawing the core instead would mean
    comparing a country against an area figure that includes land not on screen. For France,
    Norway and Vanuatu "the area" is a question about which bits count, and this round is not the
    place to argue it; they are dropped.
  * **The camera zooms ABOUT THE PAIR.** Interpolating the layer's transform straight from
    `translate(0,0) scale(1)` to `translate(W/2,H/2) scale(S)` is a zoom centred on the SVG's
    top-left corner followed by a pan to catch up, which is exactly what it looked like — a lunge
    at a random spot and then a scramble across to the countries. Written as
    `translate(p) scale(k) translate(-q)` with q held on the pair, u = 0 is the identity and
    u = 1 is the same final framing, with everything between anchored on the shapes.

  The **answer is painted on the shapes**: the bigger country fills green and a wrong pick is
  hatched red, so the right answer and the mistake are on screen together. Labels are children of
  the layer rather than of their shape, so they **share one baseline** — hung off each shape they
  sat at different heights and read as two separate captions. They are serif, unbold and
  unhaloed: the pair is alone on a cleared map by then, so there is nothing for a stroked label
  to survive against and the outline only made it shout. The two phases are split along the axis
  that carries the meaning — phase one is a pure **north–south** carry over each country's own
  longitude, phase two closes the pair up **and** brings the camera in, because those are the same
  gesture. Doing all of it at once meant the shapes were still travelling while the frame closed
  in on them, so nothing could be read.
* **`sb-upside-down` uses the transform that changes the silhouette LEAST.** Five are on
  offer — both quarter-turns, the half-turn, and both mirrors — and the one chosen is whichever
  scores highest against the country's own true outline, because that is the one that cannot be
  caught by shape alone and has to be answered by knowing which way the country points. Scoring
  is IoU between two 56×56 rasters, each fitted to its own bounds so position and size are
  normalised away, and the winner has to land in a **band**: above 0.9 the country is symmetric
  under its own best transform and no answer is defensible; below 0.25 nothing lines up at all,
  which only happens for shapes too broken up to have an orientation. Archipelagos are excluded
  outright (largest polygon part under 75% of the area) — Fiji scores 0.000 and the Bahamas
  0.038, and a scatter of dots has nothing anyone could point at whether it is the answer or a
  decoy. The transform is applied in **projected space, before fitting**, not to the fitted SVG
  the way the old 180° flip was: a quarter-turn swaps the shape's width and height, so a tile
  fitted before the turn frames it differently from its three neighbours and the framing, not
  the outline, becomes the tell. Verified — all four tiles fitted to an identical 94-unit height
  in a 110-unit box. In practice the mirrors and the half-turn win almost every draw; a
  quarter-turn is nearly always the *least* similar, so it is rare rather than absent. The
  tiles are **named, not lettered**: a letter labels a tile, but the country's own name is the
  thing being asked about and it makes the answer sayable. That also means a decided card paints
  its background green or red under the silhouette, so the silhouette is drawn **white with a
  dark edge** on a decided card — filled in the same green it sat on, the correct answer read as
  a blank green card.
  **On the reveal the tile turns back the right way round** (`sbUndoTransform` /
  `sbRightShapeTile`) — saying "mirrored top-to-bottom" is a claim, and watching it swing back
  is the proof. The correction is derived rather than approximated: both tiles are the same
  geometry through a fit of their own, so eliminating the geometry gives the exact affine
  between them, and because a `geoIdentity` fit is one uniform scale plus a translation and
  `mat` is orthogonal, that affine is always a rotation-or-axis-reflection with a scale. Those
  interpolate cleanly; a raw matrix does not — its linear blend collapses a half-turn through a
  squashed nothing on the way past. Two things the animation has to get right, both caught by
  pushing the shape's own corners through 41 frames rather than by watching it:
  * **pivot about the tile centre, not the origin.** Composing the raw translation with a
    partial rotation throws the shape clean out of its tile — a half-turn swung out to the
    corner and back, and a half-turn is the commonest case.
  * **tuck it in through the turn.** A wide shape at 90° needs the tile's height for its width
    and was clipped by the tile's own SVG (measured 25 px past a 150×110 box). The scale is
    reduced by exactly what the rotated bounding box needs, which is 1 at both ends by
    construction — the shape fits at the start, and the finish is a proper fit of its own.
  Verified over **all 142 eligible countries** at 41 frames each: **zero overflow** and the
  endpoint **pixel-identical** to how the country would have been drawn untransformed. The
  auto-advance is held back for the flip, and the tween has the usual `setTimeout` backstop,
  since d3 transitions are rAF-driven and a backgrounded tab would strand the shape mid-swing.
* **`sb-all-neighbours` always offers twelve names**, however many of them are real
  neighbours. A list that shrinks with the answer count tells you how many to pick before you
  have looked at the map.
* **`sb-all-neighbours` draws its wrong answers from the NEAREST non-neighbours.** A distractor from another continent is dismissed without knowing anything about the borders; a country 200 km away that just misses touching is the question.
* **`sb-great-circle` rejects a pair unless EVERY wrong route is measurably longer.** Near the
  equator, or on a nearly north-south haul, the map's straight line and the great circle
  coincide — and the bent decoys close on it too, since their fixed 28° sag barely lengthens a
  route that already runs that way. Measured before the gate covered all three alternatives, the
  closest wrong answer came within **0.24%** of the right one, which is a coin flip dressed as a
  question; at a 6% floor the worst case over 39 draws is **6.06%**. Pairs more than 180° apart
  are dropped too: the straight line is interpolated in lon/lat, so it would be drawn the long
  way round the map.
* **`sb-flyover`'s reveal fills in and names what the route crossed**, endpoints included and in
  their own colour (they were excluded from the question, so painting them like the answers
  would read as "you missed these two"). With no borders drawn, "Kazakhstan" on its own means
  nothing unless you are shown which patch of blank land that was — and reading the filled map
  takes longer than a pause, so this is the one `multi` round that **waits for Next** instead of
  auto-advancing. The fills carry their feature as datum, so `sbUpdateOverlay` re-paths them on
  any pan or zoom, and the route and its airport pins are re-raised above them.
* **A `preload` hook holds a round back while its data is still in flight** (lakes, airports, and the recoloured flag are all fetched on demand). The retry loop is synchronous, so without it the first round of such a mode was always skipped — and the guard has to test the **mode**, not `sbQuestion`, which is still `undefined` on the very first render.
* **`sbUpdateOverlay` re-paths from stored data.** Every overlay element carries the geometry it was drawn from as its d3 datum (and point-anchored things carry `{at, dy}` under `.sb-anchored`), so routes, lake outlines, route letters and airport pins all follow drag, wheel and pinch. Before this they were drawn once and drifted off the map the moment it moved, which is why the rounds using them had to be static.
* **Reveal animations must not depend on rAF alone.** d3 transitions are rAF-driven and a backgrounded tab does not fire it, so `sbRevealEquator` sets its finished state unconditionally from a `setTimeout` backstop — the same trap the puzzle's piece `settle` documents. Reveals also push the auto-advance back, deferred a tick because the shared answer handlers schedule *their* advance after calling `sbPlayRevealAnimation` and the last write wins.
* Border lengths are cached per round (`sbMeshLenCache`, reset in the shared entry): a mesh over the whole topology is not free.

### Who's Missing sandbox

`missing-sandbox` is the quiz's surgery with the question taken away: every country is
colour-coded by whether it CAN be dissolved into its neighbours and, if not, by what stops it,
and clicking one performs the operation. It exists because the eligibility rules are not
obvious from outside — "landlocked, two neighbours or more, and the finished geometry has to
audit clean" sounds like small print until you see it rule out four countries in five.

Measured at 110m: **125 removable**, of which 102 sit inside the quiz's size band; 17 divide
badly, 22 are too small to have a boundary worth cutting, 4 contain an enclave, and 18 are
islands with no land neighbour — the only structural bar left. The classification is **chunked** (40 ms
of work, then yield): the surgery is ~30 ms a country and forty in one pass is a second and a
half of frozen page, on a tool whose whole point is that you can poke at it. The cheap
structural rules are settled first so the map is already meaningful while the audit fills in
behind them. Clicking an ineligible country explains itself rather than doing nothing — that is
the more interesting half of the tool.

### The five-colour map

`#map-colour-toggle`, offered on Who's Missing and its sandbox. No two neighbours share a
colour, which is the most useful way to look at a map when the question is about which country
is next to which — and on a plain single-fill map the seam where a country was absorbed is
invisible, so with the neighbours coloured the new border is the only place two blocks of one
colour meet.

Greedy in descending order of degree (Welsh–Powell), then a **repair sweep**. One greedy pass
left two clashing pairs out of 615 adjacencies, entirely an artefact of visiting order: a
country coloured early boxes in a country coloured late. Re-examining the clashers once the
whole map is coloured almost always finds a free colour, because by then every neighbour is
known rather than half of them. After the sweep: **0 clashes over 609 adjacent pairs**, using
four of the five. Recomputed per round rather than cached, since Who's Missing rewrites exactly
the adjacency the colouring is derived from.

### Resolution

`hiRes` on a spec forces the **10m** atlas, past the detail toggle's own 50m ceiling, and
skips the `medium` simplification pass. It is set for the three rounds judged on an outline
rather than on a setting — Mercator Lies (two shapes compared at true size), Name the Lake and
Upside Down (a silhouette shown alone). `sbLakeFeatures` takes the **names** from the bundled 110m
file — the lakes the map itself shows by default, i.e. the Great Lakes, Victoria, Baikal and
their peers — and the **geometry** from 10m. Both halves matter: at 110m, Erie and Huron are
near-identical blobs and the round is unanswerable, while the whole 10m list would deal obscure
reservoirs nobody could name. That leaves 24 lakes, each drawn at full detail (Baikal, 662
vertices) on a Mercator fitted to itself.

### Presentation is fixed per round

None of the quick quizzes offers the **globe/flat, tilt or detail toggles**. Each presents
itself one way on purpose — a lone silhouette, a flat pair, a coastline-only world — and none is
answerable any better on the other projection, so the toggle is only a way to break the framing.

A **solo board also takes no pan, wheel or drag** until the answer is in (`isStaticMapMode`
tests the live round for `solo`): the projection is fitted to that one shape and nothing else,
so a wheel had nowhere to go but off the edge — scrolling on Every Neighbour simply made the
country disappear. It unlocks the moment a reveal hands the board back, since zooming into the
answer is the whole point of that map.

`flat` on a spec is therefore not just about pairs any more: the three **solo-board** rounds
(Name the Lake, Pin the Capital, Every Neighbour) carry it so their one shape is framed on a
Mercator centred on itself. Without it they opened on an orthographic globe, and `setupGlobe`
draws the **ocean disc as a sibling of `countriesGroup`** — so emptying that group for a solo
board left a blue planet with a silhouette on it and nothing else. `drawLakes` needed the same
guard for the same reason: the lake overlay is also a sibling, and while the board removing the
group once was enough at first, any later redraw put the world's lakes back over the lone shape.

### Reveals that hand the board back

`sbApplyBoardMarks` is the counterpart to `sbCustomBoard`: a reveal that wants the ordinary map
back (rather than painting over the one it has) sets `boardMarks` on the round, clears `solo`,
fits the projection to the features that matter and calls `drawCountries()`. Marks are
re-applied at the end of every `drawCountries`, which is the one place every redraw goes through
— so the player can zoom into the answer instead of freezing it.

* **Every Neighbour** plays against a bare silhouette (with the map around it, its neighbours
  are simply the shapes touching it) and only brings the map back once the answer is in, zoomed
  to hold the country, every real neighbour, and every country you named that isn't one —
  marked target / right / missed / wrong.
* **Near to Far** is played as a column of names with no map at all, so its reveal is the only
  place the geography that decided the answer is ever shown: the anchor, the five countries, and
  a **great-circle** spoke to each labelled with the distance it was ranked by. A great circle,
  not a straight line — the distance being ranked is the great-circle one, and on a Mercator
  those are not the same line — and each spoke runs between the two points the ranking was
  actually measured between (`sbNearestPair`), or it would draw one distance and label it with
  another.

  The spokes are **hairline** and carry no distance label: the order is the answer and it is
  already in the list beside the map, so a number at every midpoint only competed with the
  shapes, and at 2px five spokes converging on the anchor read as a solid wedge over the very
  countries they point at. Countries are marked with a **small flag** rather than their name —
  five country names written across a zoomed map is more type than map (`boardMarks.flags`).

  The distance itself is **nearest point to nearest point** (`sbKmApart`), not centroid to
  centroid, and it is measured over the **framing core** rather than the whole feature: "how far
  is France from Brazil" has an answer nobody means when French Guiana is allowed to count — it
  was 0 km, and is now 6,377. The Galápagos and Bouvet Island are the same case. Centroids answer a different question and get it visibly wrong on anything long or
  scattered: Chile's centroid is 2,000 km from its own northern border, so Peru read as further
  from Chile than countries Chile does not touch, and any country with an ocean territory has
  its centroid out at sea. Two touching countries are **0 km** apart, which is the only answer
  that makes "nearest" mean anything — verified: Chile–Peru 0, France–Spain 0, USA–Canada 0,
  UK–France 42 km, Japan–South Korea 77 km, against centroid figures of 3,007 / 394 / 1,815 /
  1,251 / 892. Every boundary vertex against every boundary vertex is too much at 10m, so each
  ring is walked at a stride keeping ~260 points per country (cached), which is exact to well
  under the 650 km separation the round already insists on.
* **Flyover** cannot use board marks (its board is coastlines only, with no country paths at
  all), so it paints into the overlay — but it says the same three things: a country you named
  is **solid**, one you missed is **hatched green**, one you named that the flight never crossed
  is **hatched red**. A hatch rather than a second flat colour because each country has to
  report two things at once, what it is and whether you got it, and solid-next-to-hatched reads
  without a legend. Every Neighbour uses the same three states, so the two reveals mean the same
  thing. Take-off and landing are now **guessable** rather than excluded: being told IST and then
  not being allowed to say Turkey made naming the airport stand in for naming the country.

Two more things Flyover's board needs, both of them about the route being read against nothing:
* **The answer key runs on the geometry the BOARD draws.** Flyover meshes its coastline straight
  off `gameState.mapTopology`, which is the raw fetched source, while `gameState.countries` has
  been through the medium-detail simplification pass — so the shore on screen was sharper than
  the polygons the key was tested against, and a country clipped by a few kilometres of headland
  could be on the map and not in the answer. `sbBoardFeatures()` builds the countries from the
  same topology the coastline comes from (the Netherlands: 261 vertices against 72), and the
  reveal's fills use it too, or a simplified outline shows daylight along the coast it is
  supposed to be filling.
* **`sbCountriesAlong` samples for the NARROWEST country on the route, not a typical one.** At
  140 samples an 8,000 km flight steps 57 km at a time, and the Netherlands is ~150 km across
  where a Munich–Seattle track clips it — so it was missed about half the time, which makes the
  answer key wrong rather than merely coarse. 700 samples steps ~12 km. That is 700
  point-in-polygon tests against every country, so candidates are pre-filtered by bounding box
  first (measured once per feature per round, and it rejects almost everything in four
  comparisons): **108 ms, and the result matches a 4,000-sample brute force exactly.**
* **Lakes are drawn as coastline.** A big lake is a shoreline like any other, and on a board
  showing nothing but shoreline the Caspian, the Great Lakes and Baikal are often the only
  landmark for a thousand kilometres. Same stroke as the coast, unfilled — they are outlines
  here, not water.
The world is also **refitted at the start of every round** (`fitFlatWorld`), or the pan and zoom
used to read the last flight are still in force when the next one is dealt.

### Layout

`sbNoMap` marks the rounds whose question lives entirely in the answer tiles (Upside Down, Spot
the Fake Flag) plus the slider one; they still **load** the map — the tiles are cut from its
geometry — but never show it, and skip `globe-side-layout` so the tiles fill the width instead of
a 300px column. `#map-container`'s `display` is set **both ways every round**, because an inline
`display: none` outlives the mode that set it and the next quiz would open on a zero-height map
whose overlay silently measured 0×0.

Two shared CSS defects were fixed at source in the same pass, both of which had been mis-rendering
these rounds since they were written:
* **`.feedback` was a centred flex ROW.** Right for a one-word "Correct!" badge, wrong for the
  multi-sentence explanations with inline `<strong>` these quizzes emit — under `display: flex`
  every text run becomes its own anonymous flex item laid out side by side, with no `flex-wrap`.
  It is normal flow now; the badge still reads as centred because `min-height` minus padding
  leaves exactly one line.
* **The 300px side panel forced every `.options-grid` to one column** (specificity 0-3-0), which
  silently out-ranked `.sb-img-grid` / `.sb-shape-grid` / `.sb-multi-grid` (0-1-0) — so the flag
  and silhouette tiles had never actually rendered two-up.

`body.sb-tall-active` scopes an exception to the app-wide `body { height: 100vh; overflow: hidden }`
under 1024px, exactly as `state-puzzle-active` does: on a phone these rounds are taller than the
viewport, and without it the controls bar is cut off and there is no way to submit.

**Four memos carry the sandbox's cost.** `worldTopoForDetail` is a presimplify plus a quantile
over every arc weight in the world (~100 ms) and Who's Missing calls it once per country it
tests — thirty seconds of frozen page to colour the sandbox in, for a result that cannot change
between calls; cached against the source topology it is 2.1 s for all 191. `sbAreaKm2` and
`getCountryCentroid` are memoised against `gameState.countries` itself, so anything that replaces
that list (a detail change, Who's Missing's surgery) invalidates them for free — at 10m a
centroid is a walk over tens of thousands of vertices and Mercator Lies' draw loop asks for
hundreds per round, which took `build()` from **606 ms to 0.3 ms**. `sbWholeCache` does the same
for "is this country's framing core the whole country".

Integration stays thin — the shared code gains branches, never edits: `startNewQuestion`, `maxSubForMode`, `handleMultipleChoiceAnswer`, `giveUp`, `endGame`, and the Next button (which submits for `multi`/`estimate`/`order`/`pinpoint`/`picker`/`latitude`, then advances). The pinpoint click is bound **namespaced** (`svg.on('click.sbpin', …)`), which is why `sbTeardown()` must unbind it — and must also dispose the latitude reveal's WebGL context.

## Find the Capital: the game on one map

Ten rounds are scored as a running total and each round's markers are wiped before the next,
so the mode could tell you *how far off* you were and never *how* you were wrong.
`logCapitalRound` keeps every round; `drawCapitalSummaryMap` ends the game by refitting the
world and drawing all of them at once — each answer a dot, each guess tied to it by a line
coloured through `puzzleErrorColor`, so "green is close" means the same thing here as in the
blind puzzle.

`capitalBias` is the number that makes it worth keeping. It averages the **signed** east/west
and north/south offsets, not the distances: distances always average to something positive and
say nothing, while the signed mean is exactly the part of the error that survives ten rounds —
most people carry a constant pull toward the middle of whatever map they learned on. Reported
only above 120 km, and reported as its absence otherwise ("no consistent direction — they
scatter evenly"), since a bias readout that always finds a bias is a horoscope. Verified by
playing ten rounds with a fixed 6° west / 3° north offset: it reports 596 km west and 332 km
north, and 3° × 110.574 = 331.7.

## Name All: practise what you missed

The miss list was a column of names. Two things make it useful instead:

* **The names are written on the map**, over their own shapes (`labelMissedOnMap`). It has to
  **zoom first** — at the scale a world round is played most of Europe is a few pixels across,
  and the size guard threw away 31 of 40 labels, so the feature worked perfectly and showed
  almost nothing. Framing the misses (skipped when they are scattered over more than 140°, where
  no frame helps) took Europe from 9 labels to 26. On a globe it rotates to their centroid
  first, because `fitExtent` only scales and translates and would otherwise fit a hemisphere the
  countries cannot appear in. The type shrinks with the country rather than the label being
  dropped: a small name written small still says which shape it belongs to. Re-drawing for the
  zoom rebuilds the paths, so the red highlight has to be re-applied afterwards.
* **A "Practise the N you missed" button** starts an Identify round over exactly that list
  (`startPractiseMissed`). Identify already takes its whole configuration from another mode's
  entry — this is `startIdentifyMode`'s pattern with an explicit list instead of a region's
  full one — and it asks *all* of them rather than a sample of ten, because the list is
  already the set worth asking about. `name-all` stashes `sourceRegion` so the drill can borrow
  the same map and data; its config is rewritten in place per region, so by the time the round
  ends there is otherwise nothing left to say where it came from.

## Shape ID difficulty

`SHAPE_ID_TIERS` — **Outline** (as before), **Turned** (the whole outline at a random angle),
and **Coming Into Focus**, which replaced an earlier Fragment tier. Nothing about the
*question* changes: same countries, same shape-similar distractors, only how much of the shape
you are given. Reached through `showShapeIdSelector()`, which makes `country-shape-id` the
seventh selector trigger that is also a real mode key and so must be intercepted in all three
dispatch points.

Three things it has to get right:
* **Rotate in SCREEN space, not by re-projecting.** Re-projecting would refit the country to its
  new bounding box, so how much of the viewport it fills would itself become a clue.
* **Shrink so the turned shape still fits.** The projection fitted the country upright, so a
  tall one spun a quarter turn needs the viewport's width for its height — Tonga came out
  1,064 px tall in a 600 px box. The room a w×h box needs at angle a is
  (w|cos a| + h|sin a|) by (w|sin a| + h|cos a|); solving that gives the factor. Measured over
  30 rounds of the two turned tiers: **zero overflow of the framing core**, fit factors 0.60 to
  1.00.
**Coming Into Focus** draws the country at **three points** and puts the detail back until it is
the real coastline.

Three POINTS, not three percent. A percentage makes the budget hostage to a country's islands:
South Korea is 53 polygons of which 51 are islets, so one percent of its vertices was already an
unmistakable outline of the mainland. Two things fix it — an absolute count, and a **1,000 km²
floor on the parts** (South Korea: 53 → 2, the mainland and Jeju). The budget is one pool shared
across every kept ring rather than a fraction applied to each, so an island appears only once
its own corners have out-competed the mainland's, which is the order someone sketching would
reach them in — and a ring is not drawn at all until it has earned three, which is what makes
the islands arrive one at a time instead of together as slivers. The count rises geometrically
(3 to 6 changes the shape completely; 3,000 to 3,003 changes nothing), eased to linger at the
low end. Measured on South Korea: 3, 3, 4, 5, 7, 9, 13.

The growing shape is **stroked as well as filled**: at three points it is a triangle, and a bare
fill says almost nothing about where its corners are, so the outline is what makes each new
point visibly arrive. Both it and the framing sandbox also **redraw themselves from state**
inside `drawCountries` rather than being drawn once — any caller reaching that function (a
resize, a projection change) would otherwise replace their board with the ordinary world map and
the country would simply vanish.

One thing that had to be handled: `vwWeights` returns **Infinity** for a ring's two endpoints,
because for an open polyline the ends can never be dropped. A ring has no ends — the "endpoints"
are wherever the atlas happened to start the arc — so left as Infinity they each claim a slot
before the budget buys a single real corner, and twenty islands would spend forty points saying
nothing. They are demoted to their own ring's heaviest finite weight: important within the ring,
ordinary globally. You answer whenever you are sure,
from **the whole country list** rather than four options (four options and a growing outline are
the same question asked twice: you would wait for the detail that separates those four and
answer then, which is not the game), and the score line reports how little of it you needed.

It runs on the same Visvalingam–Whyatt pass the coastline model uses, which is what makes it a
question rather than a blur: VW drops the point whose triangle with its neighbours is smallest,
so what survives at low detail is the country's actual corners — the cape, the bend in the
river, the elbow of the border — in the order a person would draw them. Two properties of that
pass matter here and neither is incidental: the weights are forced **monotonically increasing**,
so every threshold is a nested subset and points can only ever be *added* (nothing that has
appeared disappears, which is what stops the shape flickering as it grows — verified: vertex
count never decreased across a full run, Malaysia 92 → 450 → 2,525); and a removal that would
make the ring cross itself is **refused outright**, so even at one percent the silhouette is a
simple polygon rather than a knot.

Driven by `setInterval`, not `requestAnimationFrame`: rAF does not fire in a backgrounded tab,
which would freeze the outline at one percent and leave the round unanswerable until the player
came back — and this is a 26-second animation, exactly the length someone is most likely to tab
away from.

`revealShapeIdTruth` turns it back upright and fills the fragment in once the round is decided,
with the usual `setTimeout` backstop, since withholding through the answer would only make the
answer unverifiable.

## Draw the Border

The board shows context **without the answer**, and `drawBorderBoard()` builds it with `topojson.mesh`'s filter rather than by drawing features and hiding one. Mesh hands the filter the two geometries sharing each arc (the same one twice for an exterior arc), so both rules are just predicates on that pair:

* **world** — `(a, b) => a === b && !isTarget(a)`: coastlines only, no country borders at all, minus the target's own shore. A landlocked target therefore leaves no trace whatsoever.
* **state maps** — `(a, b) => !isTarget(a) && !isTarget(b)`: every other border, foreign and internal, minus anything the target touches.

Drawing per-feature cannot express this: a neighbour's outline still traces the target's border. Measured on the world board — all borders 80,263 vertices, coastlines only 60,835, drawn 60,785 with the target's 50 removed; the only 3 drawn vertices near its outline are the tripoint nodes where its neighbours' coastlines legitimately end.

**Both cases use the same rule** — `(a, b) => a === b && !isTarget(a)`, exterior arcs only. On a state map that means the coast plus the international border of the whole union and *no state lines at all*: a state is as hard to place among its neighbours as a country is, which is the point. A landlocked target therefore leaves no trace on either board (West Virginia removes nothing, because it owns no exterior arc).

**Which way is the sea** is answered by `shadeCoastline`: the same wide blurred stroke drawn twice, once clipped to the land polygons (brown, fading inland) and once through a mask of everything-but-land (blue, fading seaward). Clipping is what makes it two-sided — a stroke alone has no idea which of its flanks is water.

**Scored as position and shape, separately.** The same error splits two ways and people fail
in one or the other rather than both: the right shape in the wrong place, or the right place
with the wrong shape. One averaged number describes neither. `scoreDrawnBorder` returns both —
**position** is the gap between the two loops' centroids, **form** is the symmetric mean again
measured after sliding the drawn loop onto the true centroid, which removes exactly the
placement error and leaves size and shape. Five points each (`DRAW_BORDER_SCALE_KM` 250 for
position, `DRAW_BORDER_FORM_SCALE_KM` 180 for form — tighter, because once the loop is in the
right place being 200 km out on its outline is a much worse trace than being 200 km out on
where you put it). Verified on a Philippines round: a perfect trace scores 5 + 5; the same trace
shifted 4° east scores **0.9 for position and a full 5 for shape**, where the old single number
gave it 3.5/10 and no way to tell which half was wrong; a correctly-placed circle of the right
size scores 1.1 and 0.4.

**Zoom** is bounded to 0.65×–3.5× of the scale this round was fitted at (`DRAW_ZOOM_MIN/MAX`), anchored on the cursor. That forced the stroke to be stored in **lon/lat rather than pixels**: a pixel-recorded stroke drifts off the map the moment it zooms, and would then score against the wrong place. Verified — tracing the true outline scores 1.15 km, and zooming 3.5× afterwards still scores 1.15 km.

GeoJSON regions (India, Germany, England, Mexico) ship no arcs to filter, so they fall back to outlining the others and painting out the target's edge along its own path (`.draw-erase`) — the same result with a blunter instrument. `gameState.mapTopology` is stashed by `loadMapData` precisely so the mesh filter has something to work with, since the state atlases are fetched with plain `d3.json` and never touched `worldTopoCache`.

## Sun Path

**Four panes off one clock.** `sunPathState` is `{lat, lon, day, hour}` and `sunPathNow()` derives everything from it, so every pane is a view of a single instant rather than four animations that happen to look alike. `toggleSunPathPlay('day' | 'year')` moves that one clock — Day spins the hour (~6 s), Year walks the date while the hour keeps turning under it — and both call the same `updateSunPath()`.

| Pane | What it adds |
|---|---|
| **Sky above you** | The dome, with the triangle lattice gone (it competed with the marks that matter). A compass rose on the ground with 15° ticks, N/E/S/W sprites, the sun's ring **solid above the horizon and dotted below**, the rise/set points marked with their azimuths, and the day and night arcs labelled with their lengths. |
| **Earth in space** | A **textured globe carrying the Sunrise-line pane's own map**, so the two read as one planet. Plus the reference angles, drawn rather than asserted: the **axial tilt**, the **latitude** as an arc from the equatorial plane, the observer's **horizon as the tangent disc** at their feet, the sun's elevation arc against it — and standing on that disc, a faint **hemisphere with the sun's track arcing over it**, which is the Sky-above-you pane in miniature and in place. |
| **From the ground** | A **wide-angle 104° camera** following the sun in **both** axes, over a **sky gradient that slides with the sun's altitude** (blue → warm band → dusk purple → night) and a **rough hill silhouette**, with altitude ticks, compass ticks and the sun continuing on a **dotted line below the horizon**. A checkbox swaps it for **From orbit**. |
| **Sunrise line** | The terminator on an equirectangular map, built the same way as Sun & Moon's (a 90° cap around the antisolar point). **Click it to move the observer** — this is the only way to set longitude. |

Dashes are emitted as explicit `LineSegments` pairs rather than `LineDashedMaterial`, which needs `computeLineDistances` and still renders solid on some drivers. Labels are canvas sprites with `depthTest: false`, so they stay readable wherever they land.

**The ground pane's camera must pitch, not just pan.** Tracking the sun's azimuth alone and pinning the horizon at a fixed y is not enough: at `400/60` units per degree a summer sun at 56° projects 373 units above a 220-unit box, so the pane rendered **completely empty** for most of the day. Pitch now rests low (horizon ~78% down, so the frame is mostly sky) and rises only far enough to keep the sun `MARGIN` inside the edge — how you would actually hold a camera on it. When the sun is high the horizon legitimately leaves the bottom, so the ground rect, the horizon line and the compass ticks are all conditional on it being in frame, and the altitude ticks are generated over the **visible** range (negatives included) rather than a fixed 0–80°. The viewBox height is also derived from the cell's own aspect each draw, since a fixed 400×220 letterboxed inside a near-square pane and threw away half the height.

**The dome's track is a closed loop in hour angle and has to be cut into runs cyclically.** Sorting each sample into a single `above`/`below` array instead concatenates two *disjoint* below-horizon stretches — pre-dawn (from `H = −180`) and post-dusk (to `H = +180`) — which drew a dashed chord straight across the sky between sunrise and sunset, and put the "N h of night" label on the seam between them, down at the horizon on top of the **W** compass sprite. Runs are now built by walking the samples and merging the first into the last when both ends share a sign; labels take the midpoint of the longest run of each kind, which puts night at solar midnight (y = −0.43, well clear of the letters at y = 0.06). Verified: every normal day yields exactly two runs and polar day/night exactly one, with the lit run's length matching `dayH` to within the 2° sampling step (London 16.41 vs 16.4 h in June, 7.6 vs 7.6 in December; equator equinox 12.13 vs 12.00).

**The map pane's sub-solar longitude is `lon − H`, not `−H − lon`.** Hour angle is the observer's longitude minus the sub-solar one, so the sign matters — and the wrong form is a *mirror about the prime meridian*, which is exactly right at longitude 0 (the default, which is why it looked synchronised) and puts local solar noon on the far side of the planet at 90°E. Now verified the only way that means anything: at hour 12 the sun marker sits **exactly on** the observer at 0°, 90°E, 60°W, 150°E and 175°W, and the sub-solar point sweeps westward through the day.

**The ground pane is a true rectilinear (gnomonic) camera locked on the sun**, not a plot of azimuth against altitude. The old plot was fine while the sun was low and degenerate once it was not: azimuth runs away toward the zenith — at the equator on an equinox it swings the whole 180° in minutes — so the track sheared and the camera lurched. Gnomonic about the sun's own direction has none of that: great circles stay straight (so the horizon is a *level line* at `y = H/2 + focal·tan(alt)`, and the compass and altitude marks are closed-form), the arc is smooth everywhere, and at the zenith the frame simply rolls 180°, which is what a camera tracking the sun through the zenith does. The up reference is the zenith, via `right = f × zenith` — which reduces to a purely horizontal vector depending on **azimuth alone**, so it stays defined right up to the zenith where the azimuth's own flip rolls the picture over. Verified at the equator on an equinox (peak altitude 89.87°): nothing non-finite, sun dead centre throughout, azimuth flipping 85° → 275° across the crossing.

**Six parallels run through all three geographic panes** — the five fixed ones (both polar circles, both tropics, the equator) plus the observer's own, which is the only one that moves. `SUNPATH_PARALLELS` + `sunPathParallels(lat)` is the single list; the globe rings them, the map bars them.

On the **map** each parallel is split into its lit and dark spans and labelled with their lengths, so the bars *are* the day-length curve read straight off the map: they slide bodily west with the sunlight while their proportions change only with the date. Two things the split has to get right, both of which were wrong first time and both caught by checking that every bar spans the map's full width:
* the polar cases are a **whole circle**, and normalising both ends of a 360° span collapses it to zero width;
* the longitude→x mapping must **not wrap** — a span ending at exactly +180° belongs at the right-hand edge, not back at the left one, or every night bar measures the full width.
Verified across three dates × six parallels: all 18 span the full width and match `sunPathDayHours` to within 0.12 h, including 24 h at the Arctic Circle in June and 0 h at the Antarctic.

On the **globe**, leader lines run out to a left-hand column (`sunPathGlobeLeaders`). Everything is built in the **camera's** basis and converted back to world space, which is what lets a scene the user can pivot still produce a tidy screen-space column: leaders run level, every label starts at the same camera-x (measured: six labels, left edges identical to 3 dp), and the leaders begin clear of the longest of them. Only the near half of each ring is considered — a leader to a point round the back would cross the planet to get there.

**Earth-in-space zoom is LOCKED**, not fitted: the earth is exactly 2 units across, so a half-height of `1/0.9` makes it 90% of the frame and keeps it there. Fitting to content meant the pane breathed whenever a label changed width or the figure's little dome swung round the limb — the planet resizing to keep a 0.075-unit stick figure in shot. The consequence is that annotations must fit the fixed frame rather than expect the camera to back off: the orbital-normal line stops just above the pole, the tilt arc sits just off the surface, and the tilt label is pushed sideways **in camera space**, which is the one direction that stays clear whichever way the globe is pivoted. Verified: no label clips at any of six date/latitude/pivot combinations.

**Earth-in-space is orthographic and free-look.** Isometric keeps the tilt, latitude and sun-arc angles true wherever they sit in frame, which perspective does not. Drag pivots (`sunPathState.view` az/el, elevation clamped to ±85° where `lookAt` degenerates); Reset view returns to az 0 / el 0 — camera in the ecliptic plane at `(0, 0, 8)`, edge-on to the sunlight, so the terminator runs straight down the middle. That default is also why the ambient light had to come up: the middle of the visible face sits exactly on the terminator, where Lambert shading is zero. Orthographic framing needs its own fit (`sunPathOrthoExtent`) — there is no dolly to solve for, so the frustum half-extents are sized instead.

**Year playback runs a day at a time and steps a week at each sunset**, rather than sliding the date continuously (which moved the track and the sun at once, so nothing could be read against anything). Two traps, both found by counting jumps against day-cycles rather than by watching it:
* a sunset **and** a midnight both firing walks the calendar two weeks per day — midnight has to be a *fallback* used only when no sunset occurred, which is what keeps polar day and polar night advancing at all;
* advancing at the instant of sunset also moves the declination, and while the days are lengthening the sun on the new date is still up at that clock time, so it sets again minutes later and re-fires. Measured before the `armed` latch: **twelve jumps in five days at 51°N**, while the southern hemisphere in a shortening season looked perfectly fine. A sunset only counts while armed; only a sunrise or midnight re-arms it. Now exactly one week per day at 51°N in both spring and autumn, at the equator, at Sydney, and under both polar day and polar night — with the jump time drifting later through spring (18.8 → 19.0 → 19.2) and earlier through autumn.

**Playback speed** is `2^(v/5)` over a −20..20 slider: the midpoint is exactly 1×, the ends 1/16× and 16×. An exponent because the useful range spans two orders of magnitude (creeping through a sunset, skimming a year) and a linear slider would spend most of its travel in the fast half. Measured: 4× multiplies the rate by exactly 4 in both Day and Year, with the base rates unchanged (6 s/day, 9.1 s/year).

**The same run-splitting bug lived in the ground pane too**, and it is what drew "an odd straight line cutting across the dotted arc": one `below` array concatenating the pre-dawn and post-dusk stretches, made worse by points being *skipped* whenever the track left the camera's azimuth window, which broke runs a second way. Runs now break on both a sign change and a window exit. Measured: the largest gap between consecutive points within any run is 3.3 units (the old chord spanned the pane), and midnight correctly yields two separate below-horizon runs.

**The handedness of the globe pane is set by one minus sign, and it decides three things at once.** The observer sits at `(cos H·r, y, −sin H·r)`. The `−` is not cosmetic: the earth turns eastward about `+Y`, east at a point is `Ŷ × up` — which at the `+X` meridian is `−Z` — so as the hour advances the observer must move toward `−Z`. With `+sin H` the globe spins backwards, the map reads east–west backwards, and the sun runs the wrong way round the mini-dome's arc. They are one bug, not three. The texture is then drawn **unmirrored**, with `rotation.y = H − lon`, because `SphereGeometry` places an unmirrored equirectangular map's longitude L at mesh angle −L and the sub-solar longitude has to land at `+X`.

An earlier version had `+sin H` *and* a mirrored texture — two reflections that cancelled. The geography sat under the observer correctly and a 10-point land/ocean pixel check passed, because that check predicted each sample's position with the **same formula the renderer used**: a consistently mirrored world is self-consistent. Testing self-consistency proves nothing about handedness. What catches it is a quantity with an outside definition — **the sun's azimuth measured in the observer's own local frame**, compared against `sunAzimuth()`. Mirrored, that returns `360 − az` (249° at 09:00 instead of 111°), which is exactly what it did in all six cases tried. After the fix: **75 cases across five latitudes, five hours and three dates, worst azimuth and altitude error 0.000°**; the 14-point pixel check re-run against *physics-derived* positions is 14/14; landmarks track left-to-right (eastward) 9–10 steps to 0–1; and the sun ball on the dome arc reads 63.9° at 05:00, 180° at noon and 296.1° at 19:00, zero error over 15 cases.

**Both 3D panes frame themselves by solving per axis, not from a bounding sphere.** A sphere is badly conservative here — the widest thing in either pane is a text sprite, and a sphere large enough to contain it pushes the camera back as if the pane were that tall too, when these panes are wide and short and horizontal room is what they have spare. For a camera at `dir·d` looking at the origin, a point is inside when `|p·right| ≤ tanH·(d − p·dir)` and `|p·up| ≤ tanV·(d − p·dir)`; solving each for `d` and taking the max clips nothing at the tightest distance. Real vertices are walked for anything under 4096 of them, because the flat things (the ground disc, the parallel rings) are seen nearly edge-on and a sphere of their radius claims several times the vertical room they use — that alone was holding both cameras back. Re-framed only on a >2% change, or label text would make the camera breathe all through a playback. Verified over a 24-hour sweep: content reaches 98% of the frame height and never clips.

**From orbit** reuses the spaceship mode's Blue Marble texture and its `(R+h)/R` distance convention, deliberately *not* its atmosphere shell or cap tiles — those exist to make a photographic guessing view and here would only obscure the day/night line the pane is about. It sits at 700 km, where the horizon is 64° off nadir; the lens is **74°, wider than the spaceship mode's 48°, because at 48° you can frame the observer's own spot *or* the curved limb but not both**. Aiming at the horizon put the limb dead centre with three quarters of the pane in space, and the spaceship mode's own tilt rule threw the observer's spot three frame-heights below the bottom edge; splitting the difference (`horizonAngle/2`) lands both. Lighting verified by mean luminance over a day: at 20°N it tracks the sun exactly (133.6 at noon, 4.4 at midnight), at 70°N in June it never goes dark and in December never lights up.

Verified numerically: London's noon sun is **61.95° in June and 15.08° in December** (exactly 90 − 51.5 ± 23.44, and the pane's own year-range label agrees to 0.02°); the equinox sunrise azimuth is 90.4°, i.e. due east; hour angle 0 puts the equatorial sun at 89.7° and hour angle −180° at −89.7°; and 66.56°N at the June solstice reports polar day exactly at the boundary.

The stage is `position: absolute; inset: 0` inside `#map-container` with `z-index: 0`, and `#mode-selector` carries `z-index: 30` — but the real fix for panes appearing over the menu is that **`resetModeSelector()` now calls `teardownActiveGame()` first**, and teardown drops the Sun Path stage and the Sun & Moon panel. Sub-selectors are reachable from inside a live mode, and these modes hang canvases off containers the old reset never touched.

The original three panels were driven by the same two numbers — the observer's latitude and the sun's declination — and that remains the core: moving either slider moves everything together, and watching the panes agree *is* the mode. The whole thing is two lines of spherical astronomy with pictures wrapped round them: `sin(alt) = sin φ sin δ + cos φ cos δ cos H`, and `cos H₀ = −tan φ tan δ` for the half-day length. `halfDayAngle` returns `polar: 'day' | 'night'` rather than failing when `|cos H₀| > 1` — the midnight sun and the polar night are the interesting answers, not error cases.

Checked against known values: equator at the March equinox → 12.00 h and a noon sun at 89.7°; **London at the June solstice → 16.4 h and 61.95°** (exactly 90 − 51.5 + 23.45); 70°N → midnight sun in June and polar night in December, with the December noon sun 3.4° *below* the horizon. Sydney in December → 14.3 h.

Both canvases are plain `WebGLRenderer`s with `alpha: true` sized from their grid cells, disposed by `removeSunPathMode()`. Play runs a year in ~9 s; `dt` is capped at 0.1 s so a frame hitch can't jump the date.

## Country facts (neighbours, coastline, islands)

`ensureCountryFacts()` derives who borders whom and who has a coast **straight out of the TopoJSON**, so neither needs another data file. `topojson.neighbors` gives adjacency; the arc table gives the rest — an arc used by exactly **one** geometry is a shore rather than a shared border, so a country with no such arc is landlocked, and one with no neighbours but plenty of shore is an island. Cached per resolution, since the arcs differ between the 110m and 50m sources. Measured at 110m: 201 countries, 161 with coastline, **40 landlocked**, 45 islands — Switzerland, Bolivia, Chad, Nepal, Mongolia all read correctly.

The arc walk's `depth` argument counts down to 0 = a single arc index, so a Polygon needs **2** and a MultiPolygon **3**. Passing anything less hands whole arrays to the counter, every key is then unique, and *every* country reads as coastal — which is exactly what happened the first time round.

`playableNeighbours(name)` restricts that adjacency to the current quiz list, so a chain never asks for a country the game doesn't otherwise know. Note it is genuinely topological, not political: France borders Brazil and Suriname (via French Guiana), which is correct and occasionally surprising.

## Sun & Moon

The night side **is** a 90° cap around the antisolar point, so `d3.geoCircle` does all the work and the shapes stay correct on the globe and the flat Mercator alike (verified on both). The twilight bands are the same cap at 96° and 102°, drawn widest-first so each stacks its own alpha over the last; the terminator is that 90° circle stroked.

The astronomy is the standard low-precision series — the Astronomical Almanac's solar formulae (~0.01°) and the truncated ELP terms for the moon (~0.3°, a third of the moon's own width) — so it needs no ephemeris data. Checked against known values: at **12:00 UTC on the June solstice** the subsolar point comes out at **23.44°N, 0.46°E** (the axial tilt exactly, and the half-degree east is the equation of time), and stepping +1 hour moves it exactly −15° of longitude.

Everything is UTC, including the date/time inputs — filled from `getUTC*` rather than the local parts, or a user east of Greenwich would see the clock jump when they press Now. The time-zone overlay draws **nautical** zones (15° bands on each multiple of 15°), which is what the sun actually does; political zones wander all over that and would need their own dataset.

**Satellite imagery** reprojects the Blue Marble texture per pixel: the source is equirectangular, so any projection can be filled by walking destination pixels, inverting each to a lon/lat and sampling. Half-resolution (480 px) and debounced, since it is a still image that only changes when the map does. Two things it must get right: a pixel only counts if **projecting the inverted point lands back where it started** (orthographic's `invert` happily returns coordinates for pixels outside the disc, and Mercator's wraps past ±180), and the output must be **PNG, not JPEG** — everything off the globe is transparent and JPEG would flatten that surround to a black rectangle. Alignment spot-checked: Sahara (201,167,121), Amazon (25,38,10), mid-Atlantic (2,5,20).

The **moon is drawn as it looks**: a disc with the terminator as an ellipse whose width is `r·|1−2k|` (k = illuminated fraction), so k=0.5 collapses it to a straight line and k=1 bulges it back to a full circle, with the whole group rotated so the bright limb points at the sun's sub-point on screen. Its phase colours need the selector `.sun-moon-mark.moon .moon-dark` — the plain `.sun-moon-mark .moon-dark` (0,2,0) loses to the generic `.sun-moon-mark.moon circle` (0,2,1) and the dark limb silently renders light. The moon's own rise/set line is drawn too, **dotted** so it never reads as the sunrise line. The **tropics and polar circles** are drawn from the obliquity rather than typed in (23.44° and 90−23.44°), since their positions *are* the obliquity. **Satellite hides the lake overlay** — the imagery already shows the lakes and the vectors just fight it.

**Play year** walks a year in ~38 s, holding 3.2 s at each of the four turning points to caption what the lines are doing (`SUN_TOUR_STOPS`). The date does the moving and the layers already follow it, so the tour is just a clock plus a caption track. **Locate me** is the only geolocation call and only ever runs from that button — never on load.

`updateModeOverlays()` is called from `updateIslandMarkers()` — the one function every re-path already goes through — so the terminator, the chain and the revealed border all follow drag, wheel, pinch and animation without each mode wiring its own hooks.

## Coastline model (where spaceship spots come from)

Orbital spots sit **in a strip around the world's shoreline**, modelled once as a discontinuous polyline rather than found by throwing darts. `topojson.mesh(topo, countries, (a, b) => a === b)` keeps only the arcs no two countries share — which is exactly the coastline and nothing else — off the **110m** topology (`COAST_TOPO_URL`, shared with `worldTopoCache`), and the **major lakes** (`COAST_LAKES_URL`, the same Natural Earth 110m file the map overlay uses) contribute their polygon rings: the Great Lakes, Victoria, Baikal and the Caspian are as recognisable from orbit as any sea coast. Rings under `COAST_MIN_RING_KM` (300 km of shore) are dropped, along with the antimeridian seam and Antarctica's artificial closing edge along the bottom of the map (`COAST_ANTARCTIC_EDGE`, −84°) — but **every latitude is in play**, so Greenland and the Antarctic coast proper are both fair game (−84.3° to +83.6°, 129 rings, 372,000 km). What survives is indexed by cumulative length (`coastSegs`/`coastTotalKm`) so `coastPointAt(km)` is a binary search; the kept segments are also stitched back into runs (`coastRings`) purely so the sandbox can **draw exactly the set the picker can choose from**.

Lakes must be in hand **before** the rings are cut, which is why `whenCoastReady(cb)` waits on the topology and the lakes together and throws away anything already built when the lakes land late. A spot is a *fraction of the total shoreline length*, so resolving one against a lake-less model puts it hundreds of km from where it was authored — that is exactly what a seeded spaceship round did until `renderSpaceshipQuestion` was moved inside `whenCoastReady`. The lakes are also punched back out of the land raster (`destination-out`), since the country polygons cover them and a lake shore's water side would otherwise read as land in both the offshore probe and the land-fraction sweep.

**Visvalingam–Whyatt, self-intersections refused.** `vwWeights` runs the classic pass once per ring — repeatedly drop the point whose triangle with its neighbours is smallest, recording that area as the point's weight — so the strength slider is afterwards just a threshold (`coastSimplifyThreshold`, a quantile over every weight, so strength reads as "% of the world's coastline points cut"). Two departures from the textbook: weights are forced **monotonically increasing**, so every threshold yields a *nested* subset (without it a point can carry a smaller weight than one already removed and the line flickers as the slider moves); and a removal that would make the line cross itself is **refused outright**, the point keeping its infinite weight, which is what stops a simplified fjord folding through its own coast (cf. jasondavies.com/simplify). The crossing test only looks at `VW_CROSS_WINDOW` alive neighbours each way — a self-intersection from deleting one point is always local, and an all-pairs test would be quadratic on top of quadratic. Brute-force verified: **zero self-intersections at strengths 0/8/16/24/30/35**, where the model goes from 4871 segments to 97.

The pass **must** use a heap (`vwHeap`, lazily-deleted binary min-heap). The naive linear scan for the smallest triangle is quadratic and measured **3.5 s** over the world's coastline — precisely the entry stall this whole rewrite exists to remove. With the heap it is **19 ms** (plus 6 ms to cut the model at a given strength).

**The four tunables** are all authoritative — each decides where spots can *land*, not merely what is drawn — so all four ride in the seed header as one base36 character each (`coastTuneCodes`/`applyCoastTuneCodes`), and `startSpaceshipWithSeed(spots, tune)` applies them *before* the spots resolve. `Array.slice` drops the `.tune` property off a decoded list, which is why it is passed separately; `pendingCoastTune` holds it when a seed link arrives before the topology does (`routeFromUrl` runs long before the 110m file lands).

| Slider | Code | Default | Effect |
|---|---|---|---|
| Coast | `coastSimplifyStrength` → `coastCutFrac()` | 28 = **80% cut** | VW threshold as a fraction of all shoreline points dropped (capped at 98%) |
| Bias | `coastSizeBiasCode` → `coastSizeBias()` = code/10 | 5 = **×0.5** | Exponent on `(medianRingKm / ringKm)`, applied to every weight by `applyCoastBias`. At 0 it is plain VW — one global ranking by area. At ×2, points on the three longest rings keep **12%** while the 40 shortest keep **99%**: continents lose their wiggles before small islands lose their shape |
| Strip | `spotStripCode` → `spotStripKm()` = (code+1)×25 | 19 = **±500 km** | The reachable set is a **band**, not the line: the offset is signed, so a spot sits anywhere within ±strip of a shore, inland as readily as offshore (measured at ±500 km: mean 171 km out, 7 of 10 inland) |
| Land | `spotMinLandCode` → `spotMinLand()` | 20 = **20–80%** | The X in "between X and 100−X % land in frame". At 10 the accepted frames spread 0.34–0.88; at 35 they tighten to 0.36–0.64 |

**Positions are apportioned by true distance**, not by projected length: `kmBetween` is `d3.geoDistance × R`, so the cumulative index is great-circle km throughout. Verified over 20,000 draws — the share of spots landing in each 20° latitude band matches that band's share of real shoreline km to within **0.55 percentage points**, and a fixed 50 km step along the index moves the point 49.6–50.1 km at every latitude. (A Mercator-length index would over-weight the high latitudes by ~1/cos φ, i.e. 2–5× at 60–80°.)

The sandbox draws the strip as well as the line: `coastSegs` are bucketed into `STRIP_BAND_DEG` (10°) latitude bands and each band is stroked at its own width (`stripPixelWidth`), because Mercator inflates with latitude and one fixed stroke would be several times too narrow near the poles (measured 8 board units at the equator against 96 in the polar bands).

`ensureLandRaster()` rasterises land once into a 1024×512 equirectangular bitmap (`isLandFast` is then an array lookup). Choosing a facing tests thousands of points; the old `pickCoastalTarget` walked all 177 countries' rings for each of them, which is why sampling 400 candidates cost **~4.3 s at 110m** (worse still at the 50m the sandbox used to load). `pickCoastalTarget` survives only as the fallback for when the mesh/topology isn't available.

The view geometry is duplicated in plain arrays (`orbitalFrame`/`orbitalGroundPoint`/`viewFootprint`/`viewLandFraction`) so it works with no three.js loaded — verified to agree with three.js raycasting to 3 dp. Rays that clear the limb are clamped to their closest approach, i.e. a point *on* the horizon circle, which is what makes a footprint's far edge follow the horizon instead of running to infinity.

`resolveSpaceshipSpot({pos, var, hdg})` turns a hash triple into a full spot: `pos` picks the point on the shore, then a `mulberry32(var)` stream decides which side is water (probe 45 km each way through `isLandFast`), where in the ±`spotStripKm()` strip to sit, the roll, and a jitter on the shore-facing bearing. The PRNG is seeded from the **variation alone, deliberately** — seeding it with the position as well meant sliding a spot 100 km along the coast re-rolled its offshore distance and threw the sub-point 271 km. With `var` as the only seed, sliding keeps the framing and only the place changes, which is what makes the slider usable for authoring. An explicit `hdg` (a hand-spun facing, or a re-resolved spot) wins outright and skips the sweep; the chosen facing is always stamped back as `out.hdg`, so re-resolving an already-resolved spot replays the same view — without that, the sandbox handing its live objects to the mode re-swept them and played a different heading than the one authored. That facing is then swept through `SPOT_HEADING_SWEEP` (nearest first) until `viewLandFraction` lands between `SPOT_MIN_LAND` and 1−`SPOT_MIN_LAND` (30–70%) — an all-ocean or all-land frame is unguessable, which is the whole point of aiming at a coast. Measured over 200 spots: 192 land inside the band, mean 0.53, and the misses (isolated islands where every facing is lopsided) fall back to the closest-to-50% one.

## Spaceship sandbox

The sandbox map fits the taller **−82..84°** band (`fitSandboxWorld`, `FLAT_SANDBOX_SOUTH`) rather than the Greenland–Chile crop the guessing maps use, because the Antarctic coast is shoreline like any other and has to be visible; the fit is height-limited, so the world sits narrower than the container and centred. It is not pannable or zoomable (`isStaticMapMode`). Its layer is attached to the **map group, not `countriesGroup`** — the dot markers for tiny countries and the lake overlay are siblings that come *after* `countriesGroup`, so a layer inside it would be painted over by both; up here the shoreline and its strip stay on top of the dots.

The sandbox draws the shoreline and its strip as the reachable set, overlays the chosen spots with a heading spoke each, and for the selected one adds its **ground footprint** as a wedge over the map (`viewFootprint` → `projectedRingPath`) plus a **low-res orbital preview** — the 2048px Blue Marble base sphere and nothing else: no cap tiles, no atmosphere, no outlines, so clicking through ten spots costs nothing (`ensureSandboxPreview`/`drawSandboxPreview`/`disposeSandboxPreview`, sharing `aimOrbitalCamera` with the real view). The footprint is projected by hand rather than through `geoPath` because a spherical polygon's winding decides whether d3 fills the wedge or everything *but* the wedge.

The mode pins **110m** detail (`worldCountriesUrl`, and `forced` in `worldFeaturesFromTopology` so it skips the medium simplification pass); `#detail-toggle` is hidden for it, as for spaceship and Shape ID.

**Authoring.** The quiz is always **exactly ten** spots (`lockSpotCount` trims or tops up a decoded seed, so a hand-edited hash can't produce a 3- or 40-round game). Each spot is editable two ways:

* **On the map.** Drag a **pin** to slide that spot along the shoreline — `nearestCoast` brute-forces the segment list for the closest position, and the perpendicular distance becomes the strip offset (measured: dropping on a point off Lisbon resolves 3 km from the cursor). Drag the **handle on the end of the spoke** (`.sandbox-rotor`) to spin the view; the heading is the bearing of the cursor from the pin, so dragging east reads exactly 90°. Both write straight into the hash.
* **With the sliders.** Slide (full-range, plus ±10/±100 km nudges that go through `coastTotalKm` so a nudge is a real distance) and Spin (0–359°). Sliding re-runs the facing sweep — a new stretch of coast deserves a fresh look — while spinning and pin-dragging keep the facing the player framed.

Dragging a pin is only expressible because the 2-char `var` splits: the low base-36 digit is the position **across** the strip (`spotVarParts`/`spotVarFrom`, 36 steps — 29 km apart at ±500 km, under half a pixel at the sandbox's scale) and the high digit seeds what stays random (roll, and the tie-break when both sides of a shore read the same). Which side of the shore a drop lands on is settled by resolving both the step and its mirror and keeping whichever ends up nearer the cursor — cheaper than re-deriving the water-side normal, and it always agrees with what the player sees.

The layer splits into a static half (shoreline + strip, thousands of segments) and `drawSandboxSpots()` (footprint + pins), so a drag repaints only the latter.

**The seed.** `s4`: four leading chars for the tunables (strength, bias, strip, land), then **8 chars per spot** — 4 of base36 for a distance along the coastline, 2 for a variation index, 2 for the facing (`SPOT_HDG_MAX` = 1296 steps, 0.28°). A 10-round quiz is **86 chars** and every character means something: edit a spot's first four to slide it along the shore, its last two to spin the camera. `s3` (one tunable char), `s2` (6 chars/spot, no header or facing) and `s1` (8 chars/spot holding lon/lat/roll outright, heading re-derived by `computeCoastHeading`) all still decode so old links keep working — an older format simply leaves the tunables it never carried at whatever is currently set; `spotHeading` covers the missing facings.

Playback: `pendingSpaceshipSeed` is handed to the fresh `gameState` exactly once by `startGameWithMode` (which also sets `totalQuestions` to the seed length), then `renderSpaceshipQuestion` resolves each entry in order, and `orbitalSetTarget` uses the pinned roll **and heading** (`gameState.spaceshipHeading`). `routeFromUrl` reads `?mode=spaceship&spots=<hash>`, and `syncModeUrl` is suppressed for seeded runs so it can't overwrite the seed in the address bar.

## Flags category

`mystery-flag` (see a flag, find the country) and `flag-place` (drag every flag onto its country) are both "flag → place", so they share one 🚩 tile and `showFlagsSelector()`.

## Capitals category

`capitals-race` (type it), `capitals-choice` (pick from four) and `find-capital` (pin it on the map) are three ways of asking the same thing, so they share one ⭐ landing tile and `showCapitalsSelector()` rather than three icons. `capitals-choice` reuses `capitals-race`'s globe-highlight setup verbatim and differs only in the answer UI; its distractors come from `generateMultipleChoiceOptions(..., 'capital')`, the same pool the Find modes' capital sub-question draws from, and `giveUp` reveals it through the existing `questionType === 'capital'` branch.

`generateMultipleChoiceOptions`'s `answerType === 'capital'` branch **must shuffle after mapping** names → capitals: it used to `return` the mapped list directly, above the shuffle at the end of the function, which put the correct capital first in every single Capitals ▸ Multiple Choice question. The Find modes' capital sub-question was unaffected because it asks for `'item'` options and maps them itself, after the shuffle.

## Flag fills

`fillCountryWithFlag` paints a country's shape with its own flag. The pattern is
`userSpaceOnUse` and **rotated to local north** (`patternTransform`), rebuilt by
`updateFlagFills()` on every redraw, so the flag turns and rescales with the country as the
globe spins — it reads as painted onto the surface rather than as a window cut through it.

**Scope is the whole difficulty.** One pattern per *drawn shape* (`syncFlagPattern`, keyed by
flag code + feature id), sized to that shape's **framing core** (`shapeFramingCore`) rather
than its raw bounding box. Both halves of that matter and both have been got wrong:

* sized to the union of a country **and its territories**, the box spans most of the map;
* sized to the raw feature, it is still huge wherever the atlas ships a country as one
  scattered MultiPolygon — at 110m "France" *includes* French Guiana, so the box is 470 units
  wide against a 53-unit mainland.

Either way `slice` then crops one flat band of the flag into each shape, and mainland France
lands in the white stripe and reads as **empty** — while rotating the globe until the remote
parts clip away shrinks the box back and it works again, which is exactly the "empty unless
the globe is rotated just so" symptom. Sized to the core, the mainland gets a whole flag and
the pattern simply **tiles** across the remote parts at the same scale.

Dots get a separate `objectBoundingBox` pattern per flag (`dotFlagFill`): a marker is a few
pixels across, so orientation is meaningless and a bounding-box fill is immune to the
projection. A shape that is fully clipped by the limb yields no pattern, but the name is still
recorded — `updateFlagFills` re-derives it the moment it rotates into view.

## Flag Match

`flag-place` rings the globe with every country's flag; drag one onto its country and `fillCountryWithFlag` paints that country's shape with the flag pattern, so the map fills itself in as you play. The pool is intersected against **both** the drawn features and the flag codes, so a country with no atlas geometry or no `code` is never dealt.

It borrows the puzzle's pointer-drag conventions (listeners before `setPointerCapture`, a `position: fixed` ghost on `<body>`) but **drops by hit-testing, not by distance**: `countryUnderPointer` runs `document.elementFromPoint` and walks up to a `path.country`/`circle.island-marker`, reading the feature straight off `d3.select(el).datum()`. That works because the ghost is `pointer-events: none`. A drop on an overseas territory credits its sovereign parent, matching how clicks resolve elsewhere. Dropping on the ocean is a no-op rather than a miss — only landing on the *wrong* country counts against you.

The globe still rotates normally: a drag that starts on a tray chip captures the pointer to the chip, so it never reaches the globe's own drag handler.

## Places I've Been

`places-been`'s `QUIZ_MODES` entry is an explicit **placeholder**: `startPlacesMode(region, opts)` copies `quizList`/`dataObjKey`/`useGlobe`/`useAlbersUsa`/`mapUrl`/`mapObject`/`itemLabel(Plural)` from `countries` or `us-states` (same reconfigure pattern as `startIdentifyMode`/`startNameAllMode`) and sets `placesRegion`. `startNewQuestion()` early-returns into `renderPlacesMode()` since there is no quiz target; `#restart-btn` is repurposed as "Exit".

`PLACE_META` (label + CSS fill class per category) doubles as the category validator. `PLACE_CYCLE` is keyed by *current* category with `'none'` for unmarked, and runs **Visited → Passed through → Lived → clear**: ordered by how often each is picked, not by how committed it is, so the common case is one click and the rare one is three. `PLACE_LIST_ORDER` is intentionally a *different* order from the click cycle — most-committed first. `placesPendingSelectionsStr`/`placesPendingMessage` exist because decoding a shared link needs `gameState.currentDataObj` (the region's code↔name table), which only exists after the data load — `startPlacesMode` runs before that, so it stashes and `renderPlacesMode` drains.

Unlike the quizzes, a places click keys on the feature's **own** name, not `d.properties.parent` — clicking Denmark does not fill Greenland. `TERRITORY_BY_ID` therefore carries an own-ISO `code` per territory (with `TERRITORY_CODE_BY_NAME`/`TERRITORY_NAME_BY_CODE` built from it) so territories get their own flag and their own share-URL code; `placesCodeForName` prefers that over the parent's, and `placesFlagUrl` is deliberately quiet where `getFlagUrl` warns. `applyPlacesFills()` paints both country paths **and** dot circles and is idempotent, so it is safe to re-run after any draw — which it must be, since `drawIslandMarkers` rebuilds dots from scratch (`captureFeatureMarks` covers the paths; `drawIslandMarkers` re-calls `applyPlacesFills` for the dots).

Chip drag-between-lists is wired **once** by `wirePlacesListInteractions` as delegated listeners on the persistent `#places-lists`, so `refreshPlacesPanel`'s `innerHTML` rebuild needs no re-wiring. `dragover` reads the module-level `placesDragName` rather than `dataTransfer` (unreadable there per the HTML5 DnD spec) and `dragleave` is guarded by `!cat.contains(e.relatedTarget)` to stop child elements flickering the highlight. Hover-delete (`.place-chip-remove`) is forced visible under `@media (hover: none)` for touch.

## Shareable URLs and challenge links

Plain query params — no hash, no compression. `syncModeUrl(mode)` writes `?mode=<key>` for ordinary quiz modes from `startGameWithMode` (skipped when `placesMode`, which owns a richer URL). `placesQueryString()` adds `region` plus `places=<encoded>` and `msg=<note>`; `encodePlaces` groups ISO alpha-2 codes by category prefix into e.g. `v:fr.jp~l:de~p:us` with codes **sorted** so the same map always yields the same string, and `decodePlaces` silently skips unknown segments (forward-compatible against a hand-edited link; lossy for any place without a code). Both go through `history.replaceState` — no history entry per click, and the message box replaceStates on every keystroke.

`routeFromUrl()` runs at the end of `initGame()`; absent `?mode` it returns false and the landing page shows. A **challenge link** is `?mode=<key>&score=<n>&max=<n>`, generated by `shareCurrentGame()` (only attaching score/max once `gameState.ended`, with `max = totalQuestions * maxSubForMode(mc)`); the recipient gets `showChallengeBanner()` — a purely informational 8-second banner, with no verification or comparison — and then the quiz starts normally. `routeFromUrl` guards against starting a `placesMode` config without a region. UI: `#share-btn` in the controls bar, `appendChallengeButton` on the end-game screen, `#places-share-btn` in the places panel; `copyShareLink` writes to the clipboard and falls back to a `showToast` pointing at the address bar (which is why the URL is always replaceStated *before* the copy). There is no `localStorage` — the URL **is** the persistence.

## Drag-to-reorder (population-order)

`DragToReorder` (used by `renderOrderingMode`) is a **custom pointer drag**, not HTML5 DnD, so the drag can show a live preview instead of a browser ghost image. `render()` sets `element.draggable = false` *and* walks child `<img>`s doing the same, since natively draggable flag images would hijack the pointer. `handlePointerDown` snapshots the whole baseline layout (`tops`/`bottoms`/`centers`) in one `getBoundingClientRect` pass and pins `translateY(0px)` on the un-grabbed items so the CSS `:hover` lift can't fight the shift; move/up listeners are attached *before* `setPointerCapture` (wrapped in `try/catch`) so a capture failure can't abort the drag. `handlePointerMove` derives `newIndex` from the dragged element's leading edge against those **fixed baseline** edges — monotonic in drag distance, so it never oscillates — and the swap fires as soon as the bubble's edge overlaps a neighbour's, i.e. half a bubble before the cursor gets there. `previewShift` translates the others into their hypothetical slots. `options.overClass` is vestigial here (nothing applies it; the `.drag-over` rules belong to the Places-been chips).

`renderOrderingResult` then draws a two-column guess→correct grid with an absolutely positioned `<svg class="order-arrows">` of cubic Béziers linking each guess to its true rank (green arrowhead when the guess was already right, muted when it moved). Arrows are drawn **synchronously** rather than in a `requestAnimationFrame` — row heights are fixed in CSS so measurement is valid before the flag images load, and rAF is throttled in a hidden tab — with one follow-up rAF to absorb late layout shift (font swap). The `window resize` handler is parked on `gameState._orderArrowResize` and cleared by the next `renderOrderingMode`.

## The disputed glacier

Natural Earth ships the **Siachen Glacier** as its own admin-0 unit — claimed by both India and
Pakistan and administered exclusively by neither, so the atlas declines to award it. That is the
honest cartographic choice and the wrong one here: it leaves a 2,232 km² hole belonging to no
country in the quiz list, which reads as an unclickable blank in every Find round, an unnamed
shape in Name All, and a stray neighbour in the border graph.

`splitDisputedGlacier` cuts it down the middle and gives it to both — west to Pakistan, east to
India, which is the side each actually holds (the Actual Ground Position Line runs roughly
north–south along the Saltoro Ridge with Indian positions east of it). The cut is a meridian
through the glacier's own centroid, clipped with Sutherland–Hodgman, which is a rough stand-in
for that ridge — and rough is the right precision: the point is that the map has no holes in it,
not that a quiz adjudicates a border dispute. Outer rings only, since a hole clipped
independently of its shell is a shape with no defined inside.

Called from all three places features are built (both load paths and `sbEatCountry`), so the
split survives a detail change and Who's Missing's surgery. Measured at 50m: India +997 km²,
Pakistan +1,236 km², total 2,232 — **area conserved to 100.0%** — and a point test at either end
of the glacier now returns Pakistan in the west and India in the east. At 110m Natural Earth
carries no such unit and there is nothing to do.

## Overseas territories

Dependencies that appear as their OWN world-atlas feature but belong to a sovereign parent (Puerto Rico→USA, Greenland→Denmark, New Caledonia→France, …) are tagged in `tagTerritories()` (keyed by ISO numeric id in `TERRITORY_BY_ID`, run from `loadMapData`). Each gets `properties.parent`, `properties.isTerritory`, and a `displayName` like "Puerto Rico (USA)". Effects: `highlightCountryOnGlobe`/`highlightFoundCountry` fill the parent **and** its territories (`featureBelongsTo`); a click on a territory counts as finding the parent (`handleCountryClick` uses `d.properties.parent || name`); free-explore/flag lookups resolve through the parent (`effectiveDataName`, parent flag). Because territories stay SEPARATE features with their own names, the parent's shape/centroid/bounding box (zoom, Shape-ID) naturally excludes them (with the Debug overlay on, clicking a country draws both pixel boxes — orange own-feature vs cyan with-territories — via `drawDebugBoundingBoxes`). Highlighted paths are `.raise()`d (`raiseHighlight`) so their outline paints on top of neighbours instead of being clipped.

## Map detail (LOD)

World (`mapObject: 'countries'`) modes pick their world-atlas resolution from the global `mapDetail` via `worldCountriesUrl()`. The `#detail-toggle` cycles three levels: `low`=110m, `medium`=50m simplified client-side, `high`=50m. The default is `medium`. Simplification happens in `worldFeaturesFromTopology()`: `topojson.presimplify`/`simplify` **return new topologies** (they don't mutate in place — capturing the return value is essential), and `MEDIUM_SIMPLIFY_RETAIN` (**locked at 0.2** — no longer slider-tunable) is the fraction of points kept. Fetched topologies are cached in `worldTopoCache` (via `fetchWorldTopo`) so re-detailing doesn't re-download. The 10m source is reserved for `country-shape-id` ("highest possible detail") and is not reachable from the toggle; `spaceship` forces coarse **110m** (it only needs countries for coast detection + its inset — the Blue Marble texture provides the visuals). `reloadWorldDetail()` refetches/re-simplifies, redraws, preserves rotation/scale and every per-feature mark (`captureFeatureMarks`/`restoreFeatureMarks` — see Country dots) — no new question. The toggle is hidden for `spaceship` and `country-shape-id`.

The globe defaults to tilt-locked (`gammaLocked = true`, north-up) and `medium` detail.

## The one dynamic Mercator

Exactly one view rotates its Mercator projection as you interact with it: **`isFlatWorldView()`** — a `useGlobe` world mode (`mapObject: 'countries'`) with the `#projection-toggle` flipped to "View: Map". There, horizontal pan and cursor-anchored wheel zoom adjust `projection.rotate()[0]` rather than `translate[0]`, which is what makes the map wrap seamlessly east–west instead of hitting an edge. It covers every world globe mode when that toggle is on: Find ▸ World, Identify ▸ World, Name-All (world + continents), Mystery Flag, Capitals Race/Choice, Flag Match, Free Explore, Places-been. Everything else is static or translate-only: the regional flat maps (US/India/Germany/England/Mexico) pan by `translate`, and Find-the-Capital / Map Puzzle / Spaceship Sandbox / Shape ID are fixed (`fitCapitalWorld`, or a per-country `fitExtent`) and refuse pan and zoom outright via `isStaticMapMode`.

## Game Modes

| Mode key | Description |
|---|---|
| `countries` | Click globe to find country, then identify its flag and capital (3 sub-questions per country, special 2/3+1/3 layout). Once the flag sub-question is answered, the country's shape is coloured in with its own flag via an SVG `<pattern>` (`fillCountryWithFlag`) that follows the shape as the globe rotates/zooms — see Flag fills |
| `us-states` | Click flat map to find US state, then identify its capital |
| `indian-states` | Click flat map to find Indian state, then identify its capital |
| `german-states` | Click flat map to find German Bundesland, then identify its capital |
| `uk-states` | Click flat map to find an England ceremonial county — county only, no capital (`findOnly: true`) |
| `mexican-states` | Click flat map to find a Mexican state, then identify its capital |
| `identify` | A country/state is highlighted — pick its name from 4 choices (supports all geos: world, US, India, Germany, England, Mexico) |
| `name-all` | Type all names in a geography to highlight them against a countdown timer (~6s/item, min 60s). One mode key (`nameAllMode:true`); `showNameAllModeSelector()`'s 12-button picker covers world + the 6 continents (subsets of `quizCountries`/`window.continentData`, via `startNameAllMode(region)`) **and** all 5 state-level maps (US/India/Germany/England/Mexico — each borrows its `quizList`/`dataObjKey`/`useGlobe`/`mapUrl`/`mapObject`/`itemLabel(Plural)` wholesale from that mode's own `QUIZ_MODES` entry, same pattern as `startIdentifyMode`). `renderNameAllMode()` reads `modeConfig.itemLabel(Plural)` generically for its text (not hardcoded "country"), and guards `projection.rotate()` behind `typeof === 'function'` since AlbersUSA (`us-states`) has no `.rotate()` method. |
| `population-order` | Drag 5 countries into population order (high → low). No map (`startGameWithMode` skips the map load). The drag is a **custom pointer drag**, not HTML5 DnD — see Drag-to-reorder below; the result is a two-column guess→correct grid with connecting arrows (`renderOrderingResult`) |
| `mystery-flag` | A flag is shown — click the globe to find the matching country |
| `capitals-race` | A country is highlighted — type its capital to score. Reached through the **Capitals** category (⭐), alongside `capitals-choice` and `find-capital` — see Capitals category below |
| `capitals-choice` | A country is highlighted — pick its capital from 4 choices (`capitalsChoiceMode`). Same globe-highlight setup as `capitals-race`; distractors come from `generateMultipleChoiceOptions(..., 'capital')`, the same pool the Find modes' capital sub-question uses |
| `flag-place` | **Flag Match**: a world globe ringed by every country's flag — drag each onto its country (`flagPlaceMode`). A correct drop fills that country's shape with the flag via `fillCountryWithFlag`, so the map paints itself in. See Flag Match below |
| `free-explore` | No questions, no score — click any country on the globe for a popup with its flag, capital and population (`freeExploreMode`, `renderFreeExploreMode`/`showCountryPopup`). `#restart-btn` is repurposed as "Exit Explore". Territory clicks resolve through `effectiveDataName` to the sovereign parent's data but keep the territory's own `displayLabelForName` title, so Greenland shows Denmark's flag/capital under the heading "Greenland (DK)". Uses its own `explore-overlay-layout` (below) |
| `places-been` | Paint a personal travel map — no questions, no score (`placesMode`). Click cycles a place through unmarked → Visited → Lived → Passed through → unmarked; a side panel lists the picks as draggable chips and the state round-trips through a shareable URL. See Places I've Been below |
| `state-puzzle` | Jigsaw over **any** geography (world, US, India, Germany, England, Mexico): pieces start in a tray and get dragged onto the board, snapping home within `puzzleSnapRadius` of their true position (`statePuzzleMode`). On the **world** board each piece carries its own Mercator and distorts live with the cursor's latitude. One continuous board — no rounds. Region + difficulty picked in `showStatePuzzleSelector()`. See US States Puzzle below |
| `country-shape-id` | Only the target country's outline is shown as a flat Mercator silhouette (no globe/neighbours/lakes/dots; **10m** max detail, borderless `.shape-target` fill, projection fitted to the country's **framing core**, see below; only the single target path is drawn — `drawCountries` skips the rest) — pick its name from 4 choices (`countryShapeIdMode`). The 2 wrong answers are the most **shape-similar** quiz countries (`generateShapeIdOptions`/`shapeSimilarNames`): a size/aspect/compactness descriptor (`computeShapeDescriptor`, cached in `shapeDescriptorCache`, also measured on the framing core), z-scored with size down-weighted since the silhouette is fitted to fill the view |
| `find-capital` | A capital name is shown — click the static world map to drop a guess marker, Submit; scored by total great-circle distance over X rounds (`findCapitalMode`) |
| `odd-one-out` | Four countries highlighted at once, three sharing a trait — pick the outlier (`oddOneOutMode`). Traits are computed, not shipped: continent (`continentData`), hemisphere (centroid), landlocked and island (both from the arc table). The trait is withheld until the round is decided — that *is* the question — then stated by `recordOddAnswer` either way, and all ten are replayed with their rationales on the end screen (`oddOneOutSummaryHtml`). The framing spin keeps `r_unconstrained` in step on every tick and `dragStart` interrupts it, so a drag takes the globe over cleanly instead of snapping back |
| `draw-border` | The target is **cut out** of the map and you trace its outline with the pointer (`drawBorderMode`). Runs over **any geography** (world, US, India, Germany, England, Mexico) via `showDrawBorderSelector`. Scored by the symmetric mean distance between the drawn loop and the real one. See Draw the Border below |
| `sun-moon` | View-only: where the sun and moon are directly overhead, the sunrise line, and the night side shaded, at any date and time (`sunMoonMode`). Optional nautical time-zone overlay and satellite imagery. See Sun & Moon below |
| `sun-path` | **3D**: why sunrise and sunset move through the year, shown three ways at once for one latitude and date — a horizon POV, the tilted earth in space, and the celestial dome (`sunPathMode`). No map. See Sun Path below |
| `spaceship-sandbox` | A flat world plotting every sub-point the orbital view could pick (400 live samples of `pickCoastalTarget`) with each chosen spot's heading spoke, plus a seed editor that freezes 10 spots into a shareable hash (`sandboxMode`). See Spaceship sandbox below |
| `spaceship` | A photographic low-Earth-orbit view: a **three.js** textured globe (NASA Blue Marble — low-res base sphere + per-round full-500m-res cap tiles, see the textures note) through a perspective camera over a random coastal sub-point, tilted toward the shore so the curved horizon sits in the upper third. **Altitude tunable ≤500 km** via the Orbit-height slider (`orbitAltitudeKm`); `orbitDistance()`=(R+h)/R with the default tilt (`defaultOrbitTilt()`) + pan clamp (`clampOrbitTilt()`) derived from it. **Drag to look around** — grab-style (the point under the cursor sticks; FOV-derived sensitivity) about the fixed sub-point. Guess the sub-point on the **scroll-zoomable** inset map (`d3.zoom`), Submit; **scored** by accuracy + speed − panning with slider-tunable weights (`scoreAccuracyWeight`/`scoreSpeedWeight`/`scorePanWeight` + scales). Inset guess/answer pins + the connecting line use `vector-effect: non-scaling-stroke` and a `1/k` radius so they stay a **constant on-screen size** as the inset is zoomed. The `makeAtmosphere` shader fades **in both directions away from the limb** — up into space *and* down across the earth's disc — with no hard shell edge. Its axis is each ray's **signed tangent altitude**: closest approach to the centre, minus 1, so it's positive while the ray clears the limb and negative once it cuts into the disc. That is normalised to `0` = `uSpreadSpace` above the limb → `0.5` = the limb → `1` = `uSpreadEarth` below it — the two sides scale **independently**, each with its own slider-capped reach (space ≤600 km via `atmoSpreadSpaceKm`, earth ≤1500 km via `atmoSpreadEarthKm`, since the ground haze a photo shows reads much further than the thin optical glow above the limb), and shaded by a **user-editable 5-stop gradient** (`atmoStops`: space / horizon-blue / **horizon** (fixed) / horizon-white / earth, each with colour + alpha) via chained `smoothstep` mixes over GLSL uniform arrays (`uPos[5]`/`uA[5]`/`uC[5]`). The middle **"Horizon" stop is pinned at pos 0.5** (`fixed: true`) — `setAtmoPos` no-ops on it and `buildAtmoEditor` skips attaching its drag handler entirely — so there's always an explicit anchor colour exactly at the limb regardless of where the two flanking stops are dragged. The space-side distance→position mapping is always **linear**; the earth side can instead warp through a bounded **tangent curve** (`uEarthTangent`, the "Tangent earth fade" checkbox in Settings — `tan(x·60°)/tan(60°)`, capped at 60° rather than 90° to stay finite) purely to compare the two shapes. Blending is **additive** — that's what lets one gradient serve both sides (blue reads as glow against black sky, white reads as haze over lit ground) and makes alpha mean intensity; `depthTest:false` + `renderOrder 1` are required or the earth would occlude the shell and clip the fade at the silhouette. Colours are raw sRGB `Vector3`s, **not** `THREE.Color` — colour management would convert them to linear, but a ShaderMaterial gets no output-conversion chunk, so raw sRGB is what makes the render match the swatch. No `uCamDist`: the band is anchored to tangent altitude, so it stays put as orbit height changes. Edited in Settings ▸ Spaceship by `buildAtmoEditor`/`setAtmoPos`/`applyAtmoUniforms` (a preview strip over black is an exact match for additive-over-space; stops are held `ATMO_MIN_GAP` apart because `smoothstep` is undefined when its edges coincide). A **Country-outlines hint** (`#hint-outlines-toggle` button, spaceship-only, in the **controls bar** — not Settings; `setOrbitalHint`/`orbitalHintOn`) overlays white country borders on the globe: `loadHintFeatures` fetches the **50m (medium-detail)** countries (simplified with `MEDIUM_SIMPLIFY_RETAIN`, shares `worldTopoCache`), `buildCountryLinePositions` turns them into border segments on the sphere at `HINT_RADIUS` **1.001** (just above the surface; each arc slerp-subdivided so long spans hug the ground), rendered as **fat lines** (`three/addons/lines` `LineSegments2`/`LineMaterial`, exposed as `window.THREE_Lines` via a separate dynamic import so a CDN failure can't block `window.THREE`; falls back to 1px `LineSegments` if the addon didn't load) with `resolution` kept in sync by `syncHintResolution`. Aligned to the texture via `surfaceNormal`, the opaque earth hides far-side lines by depth test. On **mobile** (`orbitalMobileSplit`, ≤768px + `body.spaceship-active`) the view **splits**: the earth canvas fills the top and the inset becomes a full-width map below it (`orbitalResize` reserves the inset height). Renders on its own WebGL canvas over the hidden `#globe` SVG (sized from the container in `orbitalResize` — measure the container, not the replaced canvas, or it runaway-zooms). Renderer: `ensureOrbital`/`orbitalSetTarget`/`orbitalLoadCap`/`drawSpaceshipView`, disposed via `disposeOrbital` |
| `skyline-id` | **Hidden from the menu** (photo pool not yet vetted) — the mode, data, and CSS are all intact; only its 3 entry points (top-bar icon in `index.html`, landing card in `index.html` **and** in `resetModeSelector()`'s template in `game.js`) are HTML-commented out. Reachable directly via `startGameWithMode('skyline-id')`. Uncomment those 3 blocks to bring it back. A real photograph of a large city's skyline — name the city from 4 choices (`skylineIdMode`). **No map at all.** Photos are fetched live from **Wikimedia Commons** (`commonsSearch`; CORS-open via `origin=*`, and every file carries machine-readable licensing). `skylineLicenceOk` keeps only PD/CC0/CC-BY/CC-BY-SA — NonCommercial, NoDerivatives and unrecognised licences are dropped — and the photographer + licence + Commons link are shown **only after the round is decided** (`revealSkylineCredit`, called from `handleCorrectAnswer` and `giveUp`), because the file title almost always names the city. `skylineQuery` appends the state/country from the entry's `label`: without it `"Toledo" skyline` returns Toledo **Spain** above Toledo Ohio, and `"St. Petersburg"` lands in Russia; the term costs ~5% of hits and fixes the wrong-city answers. `skylineCandidates` drops non-photos (SVG/portrait/maps/logos) and *ranks* rather than rejects on whether the title names the city. Whether a city has a usable photo is only knowable after searching, so `resolveSkylineTarget` retries with another city on a miss and remembers barren ones in `skylineNoPhoto`; it reserves its pick in `usedCountries` **before** the search returns so `prefetchNextSkyline` (which resolves the next round in the background — a search takes 0.5–6 s) can't collide with a live pick. Distractors are ranked by `skylineDistractorScore`: same country dominates, then same region, then closeness in **log** population — so Abidjan draws Addis Ababa/Casablanca/Alexandria, never a suburb. Options are display `label`s, not keys |
| `sb-*` (24 keys) | The **Quick Quizzes** under Sandbox — `sb-mercator-lie`, `sb-great-circle`, `sb-flyover`, `sb-daylight-lat`, `sb-lake`, `sb-all-neighbours`, `sb-estimate-pop`, `sb-distance-order`, `sb-capital-pin`, `sb-price-pop`, `sb-price-area`, `sb-missing`, `sb-fake-flag`, `sb-upside-down`, plus the second wave: `sb-antipode`, `sb-straight-on`, `sb-how-far`, `sb-out-of-scale`, `sb-subsolar`, `sb-blind-drop`, `sb-border-hops`, `sb-bridge`, `sb-further-north`, `sb-read-band`. All share the `sbQuizMode` flag and are **generated** from the `SB_QUIZZES` registry rather than declared individually — see Sandbox quizzes above |

## UI Structure

### Top Bar (in-game)
Single thin bar with: title | mode icons | score display. Two dropdown groups:
- **Find (🔍)** — expands to: World, USA, India, Germany, UK, Mexico
- **Identify (❓)** — expands to the same geos
- Direct icons: ⌨️ name-all, 📊 population, 🚩 mystery-flag, 🏳️ flag-place, ⭐ capitals, 🌐 free-explore, 📌 places, 🧩 state-puzzle, ⬠ country-shape-id, 🛰️ spaceship

Icon conventions worth keeping: **`extension` (the puzzle piece) belongs to the Puzzle** — Shape ID uses `pentagon`, Places uses `push_pin`, and the Capitals category uses `star`.

Six `data-mode` values are **selector triggers, not mode keys** — `places` opens `showPlacesModeSelector()` (a region must be picked first), `place-quiz` opens `showPlaceCountriesSelector()`, `state-puzzle` opens `showStatePuzzleSelector()` (a region and difficulty must be picked), `capitals` opens `showCapitalsSelector()`, `flags` opens `showFlagsSelector()` (Mystery Flag + Flag Match), and `spaceship` opens `showSpaceshipSelector()` (Play + Sandbox); all six short-circuit `switchToMode`. Note `spaceship` and `state-puzzle` are both real `QUIZ_MODES` keys *and* selector triggers, so the handlers must intercept them before falling through to `startGameWithMode`. Note `state-puzzle` is both a real `QUIZ_MODES` key *and* its own selector trigger, so the top-bar/grid handlers must intercept it before falling through to `startGameWithMode`. The landing grid exists **twice** — once as static markup in `index.html` and again in `resetModeSelector()`'s template string in `game.js` — and both copies must be kept in sync, along with both mode-grid click delegators (`setupEventListeners` and the re-attach inside `resetModeSelector`).

The top-bar title (`#home-link`) **and** the big landing-page title/logo (`#landing-header`, `cursor:pointer` in CSS) both call `goHome()` — the header always works as a link back to the mode selector, from any screen it's visible on (landing page, in-game, any sub-selector).

### Mode Selector (landing page)
Full-screen card grid. "Find on the Map" and "Identify" open sub-selectors for region choice. Both sub-selectors carry a **scope toggle** (`scopeToggleHtml`, delegated click handling on the persistent `#mode-selector`) letting the player choose **All** vs **Random 10** questions before picking a region — `findQuizScopeAll`/`identifyQuizScopeAll` (module-level, persist for the session; Find defaults **All**, Identify defaults **Random 10**, preserving each mode's pre-toggle default). Find applies it via `applyQuizScope(mode, findQuizScopeAll)` (mutates `QUIZ_MODES[mode].totalQuestions`) right before `startGameWithMode`; Identify folds it into `startIdentifyMode`'s existing `Math.min(10, …)` computation.

### Globe-mode layout
Every `useGlobe:true` mode except `spaceship` (its own bespoke inset/mobile-split layout) and `free-explore` (its own overlay layout, below) maximises the map: `startGameWithMode` toggles a `globe-side-layout` class on `.container` based on `modeConfig.useGlobe && !modeConfig.spaceshipMode && !modeConfig.freeExploreMode` (cleaned up in `goHome()` and `teardownActiveGame()`). `#map-container` and a `#globe-side-panel` wrapper (holding `#question-container` + `#multiple-choice-container`) are nested inside a new `#globe-layout` wrapper in `index.html`; `.globe-layout`/`.globe-side-panel` default to `display: contents` (a no-op — children behave as direct `.container` children, exactly the pre-existing layout) and only become a real `flex` row/narrow-column (map ~3fr, panel fixed 300px, collapses to a stacked column under 1024px) when `.globe-side-layout` is present. `countries` mode's separate `world-quiz-layout`/`world-quiz-globe`/`world-quiz-panels` system (2/3+1/3 split) got the same treatment via a flex-ratio tweak (globe `flex:1`, panels fixed `300px`, restoring `flex:1` on panels under the existing 1024px breakpoint since flex-basis governs height once that breakpoint flips the layout to a column).

**`useWorldQuizLayout` modes are excluded from `globe-side-layout` outright**, and the two must never both be applied. Those modes render into `#world-quiz-layout` and set `#map-container`/`#question-container`/`#multiple-choice-container` to `display: none` — which leaves `#globe-layout` holding nothing visible, but `globe-side-layout` had already promoted it from `display: contents` to a real `flex: 1 1 0%` row. It then claimed **310 px of blank space above the actual content** (measured at 1280×800), squashing the globe into the lower half.

### Free-Explore overlay layout
Free Explore has no questions and no answer buttons — only a one-line prompt and, on click, a country popup — so reserving the 300px side column wasted a third of the screen. `explore-overlay-layout` on `.container` instead gives `#map-container` the full width and makes `#globe-side-panel` an **absolutely positioned floating column over the map's top-right corner** (always empty in a globe view). The panel is `pointer-events: none` with `> * { pointer-events: auto }`, so drags that start in the gaps between its cards still rotate the globe. `showCountryPopup` re-parents `#explore-popup` into that panel when the class is present (a `#globe-side-panel .explore-popup` rule turns the fixed centred dialog into a static card that stacks under the prompt); anywhere else it stays a body-level centred dialog. Under 600px wide the column spans the full width instead.

That re-parenting is why `closeCountryPopup()` **removes** the node rather than hiding it, and why `startGameWithMode` calls it. The popup isn't attached to the map, so nothing else tore it down on a mode switch — and a merely-hidden node stays inside `#globe-side-panel` while the next mode drops `explore-overlay-layout`, which is the only thing scoping the rule that tames it. The base fixed/centred styling then took back over and stranded the popup on top of the new mode. Its Escape handler is parked on the module-level `exploreEscapeHandler` for the same reason: the old one only unbound itself when Escape was actually pressed, so closing any other way leaked a listener per country clicked.

### Flag image sizing
Flags are **not** all 3:2 — Nepal is a taller-than-wide pennant, Switzerland/Vatican are square, Qatar is 11:28. Sizing by width alone therefore gave every list row a different height. Wherever flags appear side by side or stacked (`.bubble-flag`, `.order-flag`, `.flag-option img`) they get a **fixed box + `object-fit: contain`**, so odd ratios letterbox inside instead of resizing the row. The single large `.flag-display img` is capped on both axes (`max-height` as well as `max-width`) rather than boxed, since a border around a letterbox reads badly at that size.

### Score sync
`syncScoreDisplay()` keeps the top-bar inline score in sync with `gameState`. Called automatically after every score/question update.

## Answer pacing

One constant, `ANSWER_PAUSE_MS` (default 1200ms, Settings ▸ Gameplay slider), paces every quiz mode's reveal/advance sequence — replacing what used to be a dozen independent hardcoded delays (650/800/1000/1200/1400/2500ms) scattered across `handleCorrectAnswer`/`handleIncorrectAnswer`/`handleFlagChoiceAnswer`/`handleCapitalChoiceAnswer`/`handleCountryClick`/`giveUp`, several of which weren't tracked by the shared timer at all (so a fast mode-switch mid-pause could fire a stale callback against new state).
- **Correct answer:** pause `ANSWER_PAUSE_MS`, then advance (`handleCorrectAnswer`, branching on `subQuestionIndex < maxSubForMode(modeConfig)-1` for a sub-advance vs a full `goToNextQuestion()`).
- **Wrong answer:** pause `ANSWER_PAUSE_MS`, reveal the correct answer **alongside** the wrong one (`scheduleWrongThenCorrect` — `handleIncorrectAnswer` no longer self-clears the wrong highlight; the whole button/shape grid is rebuilt fresh for the next question anyway, so nothing needs to explicitly clear it), pause `ANSWER_PAUSE_MS` again, then advance unscored (`handleCorrectAnswer(el, false)`).
- **Distance/score-based rounds** (`find-capital`, `spaceship`) have no discrete right/wrong to reveal, so they get a single `ANSWER_PAUSE_MS` pause after the result is shown (`scheduleAutoAdvance()`, called from `revealCapitalAnswer`/`revealSpaceshipAnswer`). **`population-order` is the exception**: its result grid — five guesses, five true ranks and the arrows between them — is the whole payoff of the mode, and a timed advance pulls it away mid-read, so `checkOrderingAnswer` calls `clearAutoAdvance()` and waits for the Next button instead — the relabelled Next/"See Results" button still works as a manual skip (`goToNextQuestion` calls `clearAutoAdvance()` first, so a manual click can't race the timer).
- **Give Up** (`giveUp()`) now auto-advances for every mode via the same mechanism — previously several mode-specific blocks (`skylineIdMode`, `capitalsRaceMode`, the generic tail's final-subquestion case) only enabled the Next button and waited for a manual click.
- Fixed along the way: `checkOrderingAnswer` used to increment `gameState.currentQuestion` itself *and* rely on the shared Next-button handler's `goToNextQuestion()` incrementing it again — a genuine pre-existing bug that made `population-order` skip every other round (10 configured rounds played as 5). It now only calls `scheduleAutoAdvance()`, incrementing exactly once via `goToNextQuestion`.
- `autoAdvanceTimer`/`clearAutoAdvance()`/`scheduleAutoAdvance(delay = ANSWER_PAUSE_MS)`/`goToNextQuestion()` remain the shared primitives; every reveal/advance path in the file now routes through them (or a bare `setTimeout` using `ANSWER_PAUSE_MS` explicitly) rather than an ad-hoc literal.

## Adding a New Game Mode

1. Add an entry to `QUIZ_MODES` in `game.js` with the relevant config flags.
2. Add `mysteryFlagMode`/`capitalsRaceMode`/`identifyOnly`-style boolean flag if the mode has unique question handling (maxSub=1).
3. Add a render function (`renderXxxQuestion()`).
4. Hook it into `startNewQuestion()` — set `gameState.questionType` and call your render function.
5. If the mode scores one point per target (not per sub-question), add its flag to `maxSubForMode(modeConfig)` — the **single** source of truth for sub-question count, used by `handleCorrectAnswer`, `giveUp`, and `endGame` alike (a mode missing from it there is what capped Shape-ID at 50% on a perfect run).
6. Add to the top-bar dropdowns in `index.html`, `showFindModeSelector()`, `showIdentifyModeSelector()`, and `resetModeSelector()` in `game.js`. The landing grid lives in **two** places (static markup in `index.html` *and* `resetModeSelector()`'s template) — update both, plus both mode-grid click delegators.
7. If the mode needs no map, also add its flag to the map-skip check in `startGameWithMode` and dispatch it **early** in `startNewQuestion()` — the shared body dereferences `countriesGroup` and filters against map features, and recurses forever on an empty `gameState.countries`.
8. If the mode is reached through a sub-selector rather than started directly, have that selector call `teardownActiveGame()` first.

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
- `startNameAllMode(region)` / `startPlacesMode(region, opts)` / `startPlaceCountriesMode(difficulty, submode)` / `startStatePuzzleMode(difficulty)` — the other reconfigure-then-start entry points
- `teardownActiveGame()` — tears down any live in-game view (WebGL, timers, panels, SVG) before showing a sub-selector
- `routeFromUrl()` — reads `?mode`/`region`/`places`/`msg`/`score`/`max` on load and starts the right thing
- `syncScoreDisplay()` — syncs top-bar score with gameState
- `setupGlobe()` — creates SVG (viewBox-based, responsive), projection, drag, zoom, and touch handlers

## Globe Rotation

Uses quaternion-based rotation via Fil's versor library (inlined). Key state:
- `v0, r0, q0` — drag start state (cartesian point, rotation, quaternion)
- `r_unconstrained` — stores full rotation (including gamma) for quaternion continuity between drags
- `gammaLocked` — when true, gamma (tilt) is forced to 0; togglable via UI button

**Important:** Any code that changes `projection.rotate()` outside of the drag handler (e.g. `rotateToCountry`, zoom handler, reset points) must also update `r_unconstrained = projection.rotate().slice()` to prevent snap-back on the next drag. Both animations only do so in their `.on('end', …)`, so a drag that interrupts an in-flight spin resumes from the pre-spin value.

**Shortest-path spin.** `rotateToCountry` and `zoomAndRotateToCountry` interpolate through `interpolateRotateShortest(from, to)`, not raw `d3.interpolate`. `projection.rotate()` returns a lambda in `[-180, 180]`, so any hop across the antimeridian (Fiji ↔ Alaska) used to read as a ~350° delta and spin the globe nearly all the way around the wrong way for an adjacent target. The helper nudges each axis' target by ±360° until the per-axis delta lands in `[-180, 180]`, then hands the *adjusted* target to plain `d3.interpolate`.

## Tearing down a live view

`teardownActiveGame()` exists because the sub-mode selectors (`showPlacesModeSelector`, `showPlaceCountriesSelector`) can be opened from the **in-game** top bar, and previously only swapped `#mode-selector`'s HTML — leaving the previous mode rendering *behind* the picker. It calls `disposeOrbital()`, `removeSpaceshipInset()`, `stopNameAllTimer()`, `stopGlobeSpin()`, drops `body.spaceship-active` / `.container.globe-side-layout`, removes `#places-panel`, empties both SVG roots, and hides the game containers. So it covers a live WebGL context + RAF loop, the spaceship inset, a running name-all countdown, the auto-spin timer, and the places panel. Any new sub-selector should call it first.

`disposeOrbital()` additionally **restores `#globe`'s `display`** — `drawSpaceshipView()` sets it to `none` so the D3 SVG can't peek through the mobile split gap, and nothing else undoes that.

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
  code: 'us',           // ISO 3166-1 alpha-2 (used for flagcdn.com URL).
                        // usStateData uses flagcdn SUBDIVISION codes ('us-al'),
                        // and are what Flag Match / the state maps key off.
  capital: 'Washington, D.C.',
  capitalCoords: [38.9, -77.0], // [lat, lon] — only in countryData
  population: 331893745,        // only in countryData
  similar: ['Canada', ...]      // used for distractor generation
}
```

`generateMultipleChoiceOptions` seeds exactly **one** entry from `similar` as the plausible distractor and pads the rest at random, so a `similar` list guarantees one near-miss, not more.

**Watch the id types.** `getStateName(id)`, `getCountryName(id)` and `tagTerritories()` all `parseInt(id, 10)` before looking up their numeric tables, because atlas feature ids are **zero-padded FIPS/ISO strings** (`"01"`, not `1`). Indexing the table with the raw string is what once turned Alabama–Connecticut (single-digit FIPS) into `"State 01"`, which then matched nothing in `usStateData` — no capital, no flag.

## Running Locally

```bash
npm start   # python dev-server.py — serves on localhost:8000 with no-cache headers
```

`dev-server.py` is a tiny no-cache static server (plain `python -m http.server` caches
aggressively, so edits often don't show on reload). `.claude/launch.json` uses the same
script for the in-editor preview.
