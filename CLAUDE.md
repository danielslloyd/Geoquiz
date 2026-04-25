# Geoquiz

Interactive geography quiz game built with vanilla JS and D3.js.

## Architecture

- `index.html` — single-page app; all game UI lives here
- `game.js` — all game logic (~5000 lines)
- `style.css` — all styles
- `4_niedrig.geo.json` — local GeoJSON for German states
- `uk-countries.geo.json` — local GeoJSON for UK countries (placeholder)

## Game Modes

| Mode key | Description |
|---|---|
| `countries` | Click globe to find country, then identify its flag and capital (3 sub-questions per country, special 2/3+1/3 layout) |
| `us-states` | Click flat map to find US state, then identify its capital |
| `indian-states` | Click flat map to find Indian state, then identify its capital |
| `german-states` | Click flat map to find German Bundesland, then identify its capital |
| `uk-states` | Click flat map to find UK country (England/Scotland/Wales/NI), then identify its capital |
| `identify` | A country/state is highlighted — pick its name from 4 choices (supports all geos: world, US, India, Germany, UK) |
| `name-all` | Type country names to highlight them; score = countries found |
| `population-order` | Drag 5 countries into population order (high → low) |
| `mystery-flag` | A flag is shown — click the globe to find the matching country |
| `capitals-race` | A country is highlighted — type its capital to score |

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
5. Update `handleCorrectAnswer`, `giveUp`, `endGame` maxSub checks to handle the new flag.
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
npm start   # serves on localhost:3000 (live-server)
```
