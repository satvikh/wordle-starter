# Wordle Frontend Design

## Goal

Replace the Vite connectivity placeholder with a responsive, familiar Wordle-style React game interface that consumes the SQLite game API.

## Experience

The application uses a warm off-white background, a compact masthead, a centered tile board, and the classic green/yellow/gray feedback palette. It prioritizes immediate readability over novel visual ornament: word length selection is visible before a game starts; the board is the dominant element while playing; an end-state panel communicates a win or loss and offers another game.

The UI works at mobile and desktop sizes. It provides both physical-keyboard and on-screen-keyboard input, gives input-length feedback, prevents input when the game is not active, and announces API or validation errors accessibly.

## Components and state

The implementation remains dependency-free and centers the experience in `App.jsx` with small presentational components where that improves readability:

- `NewGameControls`: chooses a length from 5 through 8 and starts a game.
- `Board`: renders `max_guesses` rows with `word_length` tiles. Submitted rows show server feedback; the active row reflects the typed draft.
- `Keyboard`: renders QWERTY keys plus Enter and Backspace; it maps feedback to the highest known state for each letter.
- `GameStatus`: shows attempts remaining during play and a win/loss panel after completion.

`App` owns the selected length, current game object, unsubmitted draft, request state, and a user-facing error message. It derives the board and keyboard state from the game response rather than duplicating server state.

## API integration

- `POST /games` starts a game with the selected `word_length`.
- `POST /games/{id}/guesses` submits the current draft. The response is expected to contain `{ guess, game }`; the client replaces local game state with `game`.
- The client does not receive or attempt to infer the target word during an active game.
- Failed requests leave the active board intact and show a concise error message.

Until the SQLite API implementation is present, the frontend displays an actionable connection message rather than falsely behaving as a local-only game.

## Interaction rules

- Alphabetic physical keys append upper-cased display characters until the draft reaches the configured length.
- Backspace removes the final draft character.
- Enter submits only a full-length draft during an active game and while no request is pending.
- On-screen keys follow the same rules.
- Game feedback states are `green`, `yellow`, and `gray`; submitted tile states take precedence over draft tiles.
- A letter’s on-screen key never regresses: green outranks yellow, which outranks gray.

## Accessibility and resilience

- All controls have visible labels or `aria-label`s.
- The board labels submitted guesses and per-letter feedback for assistive technology.
- Color feedback is reinforced with tile borders/contrast and status text.
- Loading controls are disabled while requests are in flight.
- Responsive CSS avoids horizontal scrolling at narrow viewport widths.

## Testing and verification

Frontend tests will mock the API boundary to verify game start, physical-key input, on-screen key input, submission, feedback rendering, win/loss state, and error display. The final verification runs frontend tests, lint, and production build, plus the backend pytest suite. The finished result will be evaluated against every backend and frontend requirement in the assessment README.
