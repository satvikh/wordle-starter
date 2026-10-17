# Full-Stack Wordle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a SQLite-backed Wordle API and Wordle-style React client.

**Architecture:** FastAPI persists games and guesses in SQLite; React renders server-sourced game state and submits user input through the REST API. Tests prove domain behavior, API state transitions, and client interaction.

**Tech Stack:** FastAPI, sqlite3, pytest, React, Vite, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-15-sqlite-wordle-api-design.md`; `docs/superpowers/specs/2026-10-16-wordle-frontend-design.md`

## Global Constraints

- SQLite persists games and guesses; active answers remain server-only.
- Word length is 5–8; max turns are `word_length + 1`.
- Feedback correctly handles duplicate letters.
- Client supports physical and on-screen keyboard input.

### Task 1: Backend domain and database

- [ ] Write failing pytest coverage for schema creation and duplicate-letter scoring.
- [ ] Implement SQLite schema, curated word list, two-pass scoring, and per-request database helpers in `backend/main.py`.
- [ ] Run `cd backend && pytest -q`.

### Task 2: Backend game API

- [ ] Write failing pytest coverage for game creation, hidden active answer, guess validation, persistence, win/loss, and game-scoped guess retrieval.
- [ ] Implement `POST /games`, `GET /games/{id}`, `POST /games/{id}/guesses`, and `GET /games/{id}/guesses/{guess_id}`.
- [ ] Run `cd backend && pytest -q`.

### Task 3: Frontend interactive game

- [ ] Write failing Vitest coverage for starting a game, draft input, submission, feedback, and errors.
- [ ] Replace starter UI with a responsive Wordle-style board, game controls, on-screen keyboard, physical keyboard event handling, and API integration.
- [ ] Run `cd frontend && npm test -- --run && npm run lint && npm run build`.

### Task 4: Documentation and assessment

- [ ] Document API routes, setup, tests, and architecture in `README.md`.
- [ ] Run `cd backend && pytest -q` and `cd frontend && npm test -- --run && npm run lint && npm run build`.
- [ ] Check every README requirement against the implemented result and report evidence and any limitation.
