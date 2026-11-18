# Goop Fishing — First Cast

An early playable browser prototype for Goopamon. The foundation is deliberately small and dependency-light so it can be run locally and iterated quickly.

## Run
- Node.js 20+ recommended for tests.
- Open `index.html` in a modern browser or serve the folder with a static server.
- `npm test` runs the built-in Node test suite.

## Vertical slice
- Cast → bite window → hook → skill fishing fight → catch/escape.
- Six starter Goops with rarity weights, pull-pattern modifiers, and Essence rewards.
- GoopDex, persistent Essence/catch records, and reset-save control.
- Responsive UI; pointer input supports press-and-hold reel.

## Architecture
Game rules and state live in `src/game.js`; canvas rendering and UI are in `src/main.js`; styles are in `src/style.css`; tests are in `tests/game.test.js`.

## Next milestone
Tune fight loop through playtesting, add polished Goop art/animation, equipment, spot/weather encounter modifiers, and expand edge-case tests. This is a prototype foundation, not final balance or art.