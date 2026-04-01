# Geoquiz

Interactive geography quiz game built with vanilla JS and D3.js.

## Architecture

- `index.html` — single-page app; all game UI lives here
- `game.js` — all game logic (~4400 lines)
- `style.css` — all styles

## Game Modes

| Mode key | Description |
|---|---|
| `countries` | Click globe to find country, then identify its flag and capital (3 sub-questions per country, special 2/3+1/3 layout) |
| `us-states` | Click flat map to find US state, then identify its capital |
| `indian-states` | Click flat map to find Indian state, then identify its capital |
| `german-states` | Click flat map to find German Bundesland, then identify its capital |
| `identify` | A country is highlighted — pick its name from 4 choices |
| `name-all` | Type country names to highlight them; score = countries found |
| `population-order` | Drag 5 countries into population order (high → low) |
| `mystery-flag` | A flag is shown — click the globe to find the matching country |
| `capitals-race` | A country is highlighted — type its capital to score |

## Adding a New Game Mode

1. Add an entry to `QUIZ_MODES` in `game.js` with the relevant config flags.
2. Add `mysteryFlagMode`/`capitalsRaceMode`/`identifyOnly`-style boolean flag if the mode has unique question handling (maxSub=1).
3. Add a render function (`renderXxxQuestion()`).
4. Hook it into `startNewQuestion()` — set `gameState.questionType` and call your render function.
5. Update `handleCorrectAnswer`, `giveUp`, `endGame` maxSub checks to handle the new flag.
6. Add mode buttons to: `#mode-icon-bar` and `#mode-selector` in `index.html`, and to `resetModeSelector()` in `game.js`.

## Key Functions

- `startGameWithMode(mode)` — reset state and begin a game
- `startNewQuestion()` — selects new target, dispatches to the right render function
- `handleCountryClick(event, d)` — globe click handler; accepts `location` and `mystery-flag` question types
- `handleCorrectAnswer(element)` — awards point, auto-advances sub-questions
- `giveUp()` — reveals answer for current question; mode-specific early-return handlers at the top
- `endGame()` — shows final score

## Data Shape

Each entry in `countryData` / `usStateData` / `indianStateData` / `germanStateData`:
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
