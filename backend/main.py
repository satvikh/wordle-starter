import json
import os
import random
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DATABASE_PATH = os.getenv("WORDLE_DB_PATH", str(Path(__file__).with_name("wordle.sqlite3")))
ALLOWED_WORDS_PATH = Path(__file__).with_name("data") / "allowed_words.txt"
WORD_BANK = {
    5: ("allee", "crane", "eagle", "flame", "globe", "olive", "slate", "trace"),
    6: ("bridge", "candle", "forest", "planet", "ribbon", "thrive"),
    7: ("capture", "diamond", "gallery", "journey", "lantern", "orchard"),
    8: ("building", "elephant", "midnight", "mountain", "treasure", "wildlife"),
}


def load_allowed_words() -> set[str]:
    words = {
        word.strip()
        for word in ALLOWED_WORDS_PATH.read_text(encoding="utf-8").splitlines()
        if word.isalpha() and 5 <= len(word) <= 8
    }
    return words | {word for answer_words in WORD_BANK.values() for word in answer_words}


VALID_WORDS = load_allowed_words()
FeedbackState = Literal["green", "yellow", "gray"]

app = FastAPI(title="Wordle API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateGameRequest(BaseModel):
    word_length: int = Field(default=5, ge=5, le=8)


class GuessRequest(BaseModel):
    word: str = Field(min_length=1, max_length=32)


@contextmanager
def database_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    with database_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                word_length INTEGER NOT NULL CHECK(word_length BETWEEN 5 AND 8),
                answer TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'won', 'lost')),
                max_guesses INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS guesses (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                word TEXT NOT NULL,
                feedback TEXT NOT NULL,
                guess_number INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(game_id, guess_number)
            );
            """
        )


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def choose_answer(word_length: int) -> str:
    return random.choice(WORD_BANK[word_length])


def score_guess(answer: str, guess: str) -> list[FeedbackState]:
    feedback: list[FeedbackState] = ["gray"] * len(answer)
    remaining = list(answer)
    for index, letter in enumerate(guess):
        if letter == answer[index]:
            feedback[index] = "green"
            remaining[index] = ""
    for index, letter in enumerate(guess):
        if feedback[index] == "green":
            continue
        if letter in remaining:
            feedback[index] = "yellow"
            remaining[remaining.index(letter)] = ""
    return feedback


def serialize_guess(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "word": row["word"],
        "feedback": json.loads(row["feedback"]),
        "guess_number": row["guess_number"],
        "created_at": row["created_at"],
    }


def serialize_game(connection: sqlite3.Connection, game: sqlite3.Row) -> dict:
    guesses = [
        serialize_guess(row)
        for row in connection.execute(
            "SELECT * FROM guesses WHERE game_id = ? ORDER BY guess_number", (game["id"],)
        ).fetchall()
    ]
    result = {
        "id": game["id"],
        "word_length": game["word_length"],
        "status": game["status"],
        "max_guesses": game["max_guesses"],
        "guesses_used": len(guesses),
        "guesses_remaining": game["max_guesses"] - len(guesses),
        "guesses": guesses,
        "created_at": game["created_at"],
    }
    if game["status"] != "active":
        result["answer"] = game["answer"]
    return result


def get_game_or_404(connection: sqlite3.Connection, game_id: str) -> sqlite3.Row:
    game = connection.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@app.on_event("startup")
def initialize_database() -> None:
    init_db()


@app.get("/")
def read_root():
    return {"message": "Wordle API is ready"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/games", status_code=status.HTTP_201_CREATED)
def create_game(payload: CreateGameRequest):
    game_id = str(uuid.uuid4())
    with database_connection() as connection:
        connection.execute(
            "INSERT INTO games (id, word_length, answer, status, max_guesses, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (game_id, payload.word_length, choose_answer(payload.word_length), "active", payload.word_length + 1, now()),
        )
        return serialize_game(connection, get_game_or_404(connection, game_id))


@app.get("/games/{game_id}")
def get_game(game_id: str):
    with database_connection() as connection:
        return serialize_game(connection, get_game_or_404(connection, game_id))


@app.delete("/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(game_id: str):
    with database_connection() as connection:
        get_game_or_404(connection, game_id)
        connection.execute("DELETE FROM games WHERE id = ?", (game_id,))


@app.post("/games/{game_id}/guesses", status_code=status.HTTP_201_CREATED)
def submit_guess(game_id: str, payload: GuessRequest):
    word = payload.word.strip().lower()
    with database_connection() as connection:
        game = get_game_or_404(connection, game_id)
        if game["status"] != "active":
            raise HTTPException(status_code=409, detail="This game is already complete")
        if len(word) != game["word_length"]:
            raise HTTPException(status_code=422, detail=f"Guess must have {game['word_length']} letters")
        if word not in VALID_WORDS:
            raise HTTPException(status_code=422, detail="Guess must be a valid dictionary word")

        guess_number = connection.execute(
            "SELECT COUNT(*) FROM guesses WHERE game_id = ?", (game_id,)
        ).fetchone()[0] + 1
        feedback = score_guess(game["answer"], word)
        game_status = "won" if all(state == "green" for state in feedback) else "active"
        if game_status == "active" and guess_number == game["max_guesses"]:
            game_status = "lost"

        guess_id = str(uuid.uuid4())
        connection.execute(
            "INSERT INTO guesses (id, game_id, word, feedback, guess_number, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (guess_id, game_id, word, json.dumps(feedback), guess_number, now()),
        )
        connection.execute("UPDATE games SET status = ? WHERE id = ?", (game_status, game_id))
        guess = connection.execute("SELECT * FROM guesses WHERE id = ?", (guess_id,)).fetchone()
        return {"guess": serialize_guess(guess), "game": serialize_game(connection, get_game_or_404(connection, game_id))}


@app.get("/games/{game_id}/guesses/{guess_id}")
def get_guess(game_id: str, guess_id: str):
    with database_connection() as connection:
        get_game_or_404(connection, game_id)
        guess = connection.execute(
            "SELECT * FROM guesses WHERE id = ? AND game_id = ?", (guess_id, game_id)
        ).fetchone()
        if guess is None:
            raise HTTPException(status_code=404, detail="Guess not found")
        return serialize_guess(guess)
