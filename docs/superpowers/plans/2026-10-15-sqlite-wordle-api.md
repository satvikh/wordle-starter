# SQLite Wordle API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a persistent SQLite-backed FastAPI API for creating and playing independently stored Wordle games.

**Architecture:** Keep the application in a focused FastAPI module, backed by standard-library `sqlite3`. Request handlers compose small database, state-serialization, and Wordle-scoring helpers; each request transaction either fully persists a guess and state transition or changes nothing.

**Tech Stack:** Python 3, FastAPI, Pydantic, sqlite3, pytest, FastAPI TestClient.

**Spec:** `docs/superpowers/specs/2026-10-15-sqlite-wordle-api-design.md`

## Global Constraints

- Use SQLite through Python's standard-library `sqlite3`; add no ORM.
- Support word lengths 5 through 8 and allow `word_length + 1` guesses.
- Never reveal an active game's answer.
- Score exact matches before present-but-misplaced matches to account for duplicate letters.
- Keep API state persistent across process restarts.
- Use HTTP 404 for missing resources, HTTP 409 for completed games, and HTTP 422 for invalid lengths or guesses.

## Review Focus

- A guess containing more occurrences of a letter than the answer: only unclaimed answer occurrences receive yellow feedback.
- A correct letter submitted after the game is complete: it must return 409 and not insert another guess.
- A word with valid letters but the wrong configured length: it must return 422 and not consume a turn.
- The game response before completion: it must omit `answer` entirely.
- A guess ID from another game: it must not be retrievable through a mismatched game path.

---

### Task 1: Database and Wordle Domain Helpers

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_main.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces: `score_guess(answer: str, guess: str) -> list[str]`, which returns one ordered `green`/`yellow`/`gray` result per guessed character.
- Produces: `init_db(database_path: str) -> None`, which creates `games` and `guesses` tables.
- Produces: a pytest configuration that injects an isolated temporary SQLite path before the FastAPI client is constructed.

- [ ] **Step 1: Write failing score and schema tests**

```python
def test_score_guess_marks_exact_before_duplicate_yellow():
    assert score_guess("allee", "eagle") == ["yellow", "yellow", "gray", "yellow", "green"]

def test_init_db_persists_game_and_guess_tables(tmp_path):
    init_db(str(tmp_path / "wordle.sqlite3"))
    # Query sqlite_master and assert both table names exist.
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd backend && pytest tests/test_main.py -q`

Expected: FAIL because the helper functions and pytest dependency do not yet exist.

- [ ] **Step 3: Add pytest and implement the database and scoring helpers**

Implement a two-pass scorer: first mark and consume exact answer positions; then consume remaining matching letters for yellow. Create tables with UUID text primary keys, game status, serialized feedback, and a `(game_id, guess_number)` uniqueness constraint.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd backend && pytest tests/test_main.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the domain foundation**

```bash
git add backend/main.py backend/requirements.txt backend/tests/test_main.py
git commit -m "feat: add Wordle SQLite domain helpers"
```

### Task 2: Game Creation and State Retrieval

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: `init_db(database_path: str) -> None` and the schema from Task 1.
- Produces: `POST /games` and `GET /games/{game_id}`.
- Produces: game state shaped as `id`, `word_length`, `status`, `max_guesses`, `guesses_used`, `guesses_remaining`, and `guesses`; it conditionally includes `answer` only after completion.

- [ ] **Step 1: Write failing endpoint tests for game creation and state**

```python
def test_create_game_defaults_to_five_letters_and_hides_answer(client):
    response = client.post("/games", json={})
    assert response.status_code == 201
    assert response.json()["max_guesses"] == 6
    assert "answer" not in response.json()

def test_create_game_rejects_word_lengths_outside_five_to_eight(client):
    assert client.post("/games", json={"word_length": 4}).status_code == 422

def test_get_missing_game_returns_404(client):
    assert client.get("/games/missing").status_code == 404
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd backend && pytest tests/test_main.py -q`

Expected: FAIL because `/games` does not exist.

- [ ] **Step 3: Implement game creation and state serialization**

Use a curated server-side word pool by length, select a random target, store it in SQLite, and use one serializer that retrieves ordered guesses and hides or includes the answer according to status.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd backend && pytest tests/test_main.py -q`

Expected: PASS.

- [ ] **Step 5: Commit game lifecycle endpoints**

```bash
git add backend/main.py backend/tests/test_main.py
git commit -m "feat: add persistent game endpoints"
```

### Task 3: Guess Submission and Guess Retrieval

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: stored game state, `score_guess`, and game serialization from Tasks 1–2.
- Produces: `POST /games/{game_id}/guesses` and `GET /games/{game_id}/guesses/{guess_id}`.

- [ ] **Step 1: Write failing tests for valid and invalid guesses**

```python
def test_submit_guess_returns_feedback_and_updated_state(client):
    game = client.post("/games", json={"word_length": 5}).json()
    response = client.post(f"/games/{game['id']}/guesses", json={"word": "crane"})
    assert response.status_code == 201
    assert len(response.json()["guess"]["feedback"]) == 5
    assert response.json()["game"]["guesses_used"] == 1

def test_invalid_or_wrong_length_guess_does_not_consume_turn(client):
    # Assert 422 and a subsequent GET still reports zero guesses used.

def test_completed_game_rejects_new_guess(client):
    # Seed a completed game through allowed API calls, then assert 409.

def test_guess_cannot_be_read_under_a_different_game(client):
    # Assert 404 for a valid guess ID combined with another game ID.
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd backend && pytest tests/test_main.py -q`

Expected: FAIL because guess routes do not exist.

- [ ] **Step 3: Implement transactional guess handling**

Normalize to lower-case, validate length and server-side dictionary membership before writing, calculate `guess_number`, persist feedback JSON, and update status in the same transaction. Return both the persisted guess and serialized game. The final unsolved allowed guess marks the game lost; an all-green guess marks it won.

- [ ] **Step 4: Run all backend tests to verify they pass**

Run: `cd backend && pytest -q`

Expected: PASS.

- [ ] **Step 5: Commit guess endpoints**

```bash
git add backend/main.py backend/tests/test_main.py
git commit -m "feat: add validated Wordle guesses"
```

### Task 4: API Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: complete API from Tasks 1–3.
- Produces: documented local setup and endpoint summary; complete backend verification.

- [ ] **Step 1: Write failing tests for win/loss answer visibility**

```python
def test_won_and_lost_games_reveal_answer_only_after_completion(client):
    # Assert active response omits answer; win and loss responses include it.
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd backend && pytest tests/test_main.py -q`

Expected: FAIL until completed-state serialization is fully covered.

- [ ] **Step 3: Complete state behavior and document the API**

Update the README with routes, request/response examples, the SQLite persistence location/configuration, and test instructions. Make only the code adjustments needed by the new final-state test.

- [ ] **Step 4: Run backend and frontend verification**

Run: `cd backend && pytest -q && cd ../frontend && npm run lint && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit the verified API**

```bash
git add README.md backend/main.py backend/tests/test_main.py
git commit -m "docs: describe SQLite Wordle API"
```
