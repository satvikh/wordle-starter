# SQLite Wordle API Design

## Goal

Replace the starter FastAPI response with a persistent Wordle API that can create independent games, accept validated guesses, return Wordle feedback, and expose game state.

## Scope and constraints

- SQLite is the persistent store; the database is local to the backend and survives process restarts.
- A game uses a target-word length from 5 through 8 inclusive.
- A game allows exactly `word_length + 1` guesses.
- Guesses must be dictionary words and exactly match the game's word length.
- A word may contain repeated letters. Feedback uses the standard two-pass Wordle rule: exact-position matches are green first; the remaining occurrences can become yellow only while the answer has unclaimed occurrences; all other letters are gray.
- Answers are non-plural words.
- The answer is never returned while a game is active. It is returned once a game is won or lost.
- No authentication, multiplayer, deletion, or frontend changes are included in this API change.

## Data model

`games`

- `id`: generated UUID string, primary key.
- `word_length`: integer from 5 to 8.
- `answer`: selected target word, stored lower-case.
- `status`: `active`, `won`, or `lost`.
- `max_guesses`: `word_length + 1`.
- `created_at`: UTC timestamp.

`guesses`

- `id`: generated UUID string, primary key.
- `game_id`: foreign key to `games.id`.
- `word`: submitted lower-case word.
- `feedback`: serialized ordered list of `green`, `yellow`, and `gray` statuses.
- `guess_number`: one-based sequence, unique within a game.
- `created_at`: UTC timestamp.

The implementation will use Python's standard-library `sqlite3` module, avoiding an unnecessary ORM or database dependency. Each request opens a connection configured with foreign-key enforcement and row dictionaries.

## API contract

### `POST /games`

Request body: `{ "word_length": 5 }` where `word_length` is optional and defaults to `5`.

Response: HTTP 201 and the newly created game state. It includes `id`, `word_length`, `status`, `max_guesses`, `guesses_used: 0`, `guesses_remaining`, and an empty `guesses` array. It excludes `answer`.

Invalid word lengths return HTTP 422.

### `POST /games/{game_id}/guesses`

Request body: `{ "word": "crane" }`.

The server returns HTTP 201 with the persisted guess: `id`, `word`, `guess_number`, and ordered `feedback`. It also returns the updated game state so the client can render the board without another request.

Error behavior:

- Unknown game: HTTP 404.
- Completed game: HTTP 409.
- Wrong-length word or a non-dictionary word: HTTP 422.

On a correct guess, the game status becomes `won`. On an unsuccessful final permitted guess, it becomes `lost`.

### `GET /games/{game_id}`

Returns HTTP 200 with the game state and ordered guess history. Active games omit `answer`; completed games include it. Unknown games return HTTP 404.

### `GET /games/{game_id}/guesses/{guess_id}`

Returns one persisted submission. It is included to support direct status retrieval, though normal clients receive the same submission from the create-guess response. A guess not belonging to the game is HTTP 404.

## Word source

The backend will carry a small curated built-in word list grouped by supported length. It contains non-plural answer candidates and valid allowed guesses. This keeps the assessment deterministic and self-contained; a future version can replace it with a full dictionary file without changing API or database contracts.

## Error handling

Validation errors use FastAPI's HTTP 422 semantics and explicit actionable messages. Domain conflicts use HTTP 409. Database reads and writes run in transactions; a failed guess request must not consume a turn or leave a partial guess row.

## Testing

Pytest will exercise API requests against a temporary SQLite database. Coverage includes game creation, state persistence, valid submission persistence, wrong-length and invalid-word rejection, completed-game rejection, win/loss transitions, answer concealment, and repeated-letter scoring.
