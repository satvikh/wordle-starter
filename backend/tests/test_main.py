import sqlite3

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture()
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "wordle.sqlite3"
    monkeypatch.setattr(main, "DATABASE_PATH", str(database_path))
    main.init_db()
    with TestClient(main.app) as test_client:
        yield test_client


def test_score_guess_consumes_exact_matches_before_duplicate_yellows():
    assert main.score_guess("allee", "eagle") == ["yellow", "yellow", "gray", "yellow", "green"]


def test_init_db_creates_game_and_guess_tables(tmp_path, monkeypatch):
    database_path = tmp_path / "wordle.sqlite3"
    monkeypatch.setattr(main, "DATABASE_PATH", str(database_path))
    main.init_db()
    with sqlite3.connect(database_path) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"games", "guesses"}.issubset(tables)


def test_creating_game_hides_active_answer_and_sets_turns(client):
    response = client.post("/games", json={"word_length": 5})
    assert response.status_code == 201
    game = response.json()
    assert game["word_length"] == 5
    assert game["max_guesses"] == 6
    assert game["guesses_used"] == 0
    assert game["guesses_remaining"] == 6
    assert "answer" not in game


def test_game_length_must_be_between_five_and_eight(client):
    assert client.post("/games", json={"word_length": 4}).status_code == 422
    assert client.post("/games", json={"word_length": 9}).status_code == 422


def test_guess_persists_feedback_and_updates_game(client):
    game = client.post("/games", json={"word_length": 5}).json()
    response = client.post(f"/games/{game['id']}/guesses", json={"word": "crane"})
    assert response.status_code == 201
    body = response.json()
    assert body["guess"]["word"] == "crane"
    assert len(body["guess"]["feedback"]) == 5
    assert body["game"]["guesses_used"] == 1
    assert body["game"]["guesses"][0]["id"] == body["guess"]["id"]


def test_invalid_or_wrong_length_guess_does_not_consume_a_turn(client):
    game = client.post("/games", json={"word_length": 5}).json()
    response = client.post(f"/games/{game['id']}/guesses", json={"word": "toolong"})
    assert response.status_code == 422
    response = client.post(f"/games/{game['id']}/guesses", json={"word": "zzzzz"})
    assert response.status_code == 422
    assert client.get(f"/games/{game['id']}").json()["guesses_used"] == 0


def test_common_dictionary_words_outside_the_answer_pool_are_accepted(client):
    game = client.post("/games", json={"word_length": 5}).json()
    response = client.post(f"/games/{game['id']}/guesses", json={"word": "adore"})
    assert response.status_code == 201


def test_winning_guess_reveals_answer_and_blocks_more_guesses(client, monkeypatch):
    monkeypatch.setattr(main, "choose_answer", lambda word_length: "crane")
    game = client.post("/games", json={"word_length": 5}).json()
    won = client.post(f"/games/{game['id']}/guesses", json={"word": "crane"})
    assert won.status_code == 201
    assert won.json()["game"]["status"] == "won"
    assert won.json()["game"]["answer"] == "crane"
    assert client.post(f"/games/{game['id']}/guesses", json={"word": "slate"}).status_code == 409


def test_final_unsolved_guess_loses_and_reveals_answer(client, monkeypatch):
    monkeypatch.setattr(main, "choose_answer", lambda word_length: "crane")
    game = client.post("/games", json={"word_length": 5}).json()
    for _ in range(6):
        response = client.post(f"/games/{game['id']}/guesses", json={"word": "slate"})
        assert response.status_code == 201
    final_game = response.json()["game"]
    assert final_game["status"] == "lost"
    assert final_game["answer"] == "crane"


def test_guess_cannot_be_retrieved_under_a_different_game(client):
    first = client.post("/games", json={"word_length": 5}).json()
    second = client.post("/games", json={"word_length": 5}).json()
    guess = client.post(f"/games/{first['id']}/guesses", json={"word": "crane"}).json()["guess"]
    assert client.get(f"/games/{second['id']}/guesses/{guess['id']}").status_code == 404


def test_deleting_a_game_removes_it_and_its_guesses(client):
    game = client.post("/games", json={"word_length": 5}).json()
    client.post(f"/games/{game['id']}/guesses", json={"word": "crane"})
    assert client.delete(f"/games/{game['id']}").status_code == 204
    assert client.get(f"/games/{game['id']}").status_code == 404
    assert client.delete(f"/games/{game['id']}").status_code == 404
