import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
const STATE_RANK = { gray: 1, yellow: 2, green: 3 }
const STORAGE_KEY = 'wordle-games'

function loadSavedGames() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function gameSummary(game) {
  return {
    id: game.id,
    word_length: game.word_length,
    max_guesses: game.max_guesses,
    status: game.status,
    guesses_remaining: game.guesses_remaining,
    guesses: (game.guesses || []).map(({ word, feedback }) => ({ word, feedback })),
  }
}

function SavedGameThumbnail({ saved }) {
  const guesses = saved.guesses || []
  const maxGuesses = saved.max_guesses || saved.word_length + 1

  return (
    <span className="saved-game-thumbnail" aria-hidden="true" style={{ '--saved-word-length': saved.word_length }}>
      {Array.from({ length: maxGuesses }, (_, rowIndex) => {
        const guess = guesses[rowIndex]
        return (
          <span className="saved-thumb-row" key={rowIndex}>
            {Array.from({ length: saved.word_length }, (_, letterIndex) => {
              const filled = Boolean(guess?.word?.[letterIndex])
              const state = guess?.feedback?.[letterIndex] || ''
              return <span className={`saved-thumb-tile ${state} ${filled ? 'filled' : ''}`} key={letterIndex} />
            })}
          </span>
        )
      })}
    </span>
  )
}

function Board({ game, draft }) {
  const rows = Array.from({ length: game.max_guesses }, (_, rowIndex) => {
    const guess = game.guesses[rowIndex]
    const letters = guess ? guess.word.toUpperCase() : rowIndex === game.guesses.length ? draft : ''
    return (
      <div className="board-row" key={rowIndex}>
        {Array.from({ length: game.word_length }, (_, letterIndex) => {
          const letter = letters[letterIndex] || ''
          const state = guess?.feedback[letterIndex] || ''
          const label = letter
            ? `Letter ${letter}${state ? `, ${state}` : ', draft tile'}`
            : 'Empty tile'
          return <div className={`tile ${state} ${letter ? 'filled' : ''}`} aria-label={label} key={letterIndex}>{letter}</div>
        })}
      </div>
    )
  })
  return <section className="board" aria-label="Wordle board" style={{ '--word-length': game.word_length }}>{rows}</section>
}

function Keyboard({ states, disabled, onKey }) {
  return (
    <div className="keyboard" aria-label="On-screen keyboard">
      {KEY_ROWS.map((row, rowIndex) => (
        <div className="key-row" key={row}>
          {rowIndex === 2 && <button className="key wide" disabled={disabled} onClick={() => onKey('ENTER')}>Enter</button>}
          {[...row].map((letter) => <button className={`key ${states[letter.toLowerCase()] || ''}`} aria-label={letter} disabled={disabled} key={letter} onClick={() => onKey(letter)}>{letter}</button>)}
          {rowIndex === 2 && <button className="key wide" aria-label="Backspace" disabled={disabled} onClick={() => onKey('BACKSPACE')}>⌫</button>}
        </div>
      ))}
    </div>
  )
}

function App() {
  const [selectedLength, setSelectedLength] = useState(5)
  const [game, setGame] = useState(null)
  const [savedGames, setSavedGames] = useState(loadSavedGames)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const keyboardStates = useMemo(() => {
    if (!game) return {}
    return game.guesses.reduce((states, guess) => {
      guess.word.split('').forEach((letter, index) => {
        const next = guess.feedback[index]
        if (!states[letter] || STATE_RANK[next] > STATE_RANK[states[letter]]) states[letter] = next
      })
      return states
    }, {})
  }, [game])

  async function request(url, options) {
    const response = await fetch(url, options)
    const body = response.status === 204 ? null : await response.json()
    if (!response.ok) throw new Error(body.detail || 'Something went wrong. Please try again.')
    return body
  }

  function rememberGame(nextGame) {
    const nextGames = [gameSummary(nextGame), ...savedGames.filter((saved) => saved.id !== nextGame.id)]
    setSavedGames(nextGames)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGames))
    } catch {
      // The active game remains usable even when browser storage is unavailable.
    }
  }

  async function startGame() {
    setLoading(true)
    setError('')
    try {
      const nextGame = await request(`${API_URL}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word_length: selectedLength }),
      })
      setGame(nextGame)
      rememberGame(nextGame)
      setDraft('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function submitDraft() {
    if (!game || game.status !== 'active' || draft.length !== game.word_length || loading) return
    setLoading(true)
    setError('')
    try {
      const response = await request(`${API_URL}/games/${game.id}/guesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: draft.toLowerCase() }),
      })
      setGame(response.game)
      rememberGame(response.game)
      setDraft('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function restoreGame(gameId) {
    setLoading(true)
    setError('')
    try {
      const restoredGame = await request(`${API_URL}/games/${gameId}`)
      setGame(restoredGame)
      rememberGame(restoredGame)
      setDraft('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function removeGame(gameId) {
    setLoading(true)
    setError('')
    try {
      await request(`${API_URL}/games/${gameId}`, { method: 'DELETE' })
      const nextGames = savedGames.filter((saved) => saved.id !== gameId)
      setSavedGames(nextGames)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGames))
      if (game?.id === gameId) {
        setGame(null)
        setDraft('')
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKey(value) {
    if (!game || game.status !== 'active' || loading) return
    if (value === 'ENTER') return submitDraft()
    if (value === 'BACKSPACE') return setDraft((current) => current.slice(0, -1))
    if (/^[A-Z]$/.test(value) && draft.length < game.word_length) setDraft((current) => `${current}${value}`)
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Enter') handleKey('ENTER')
      else if (event.key === 'Backspace') handleKey('BACKSPACE')
      else if (/^[a-zA-Z]$/.test(event.key)) handleKey(event.key.toUpperCase())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const complete = game && game.status !== 'active'

  return (
    <main className="game-shell">
      <header className="masthead">
        <p className="eyebrow">Daily word craft</p>
        <h1>WORDLE</h1>
        <p className="subtitle">Find the hidden word in {game ? game.max_guesses : selectedLength + 1} tries.</p>
      </header>

      <section className="game-card">
        <div className="game-controls">
          <label htmlFor="word-length">Word length</label>
          <select id="word-length" value={selectedLength} disabled={loading} onChange={(event) => setSelectedLength(Number(event.target.value))}>
            {[5, 6, 7, 8].map((length) => <option key={length} value={length}>{length} letters</option>)}
          </select>
          <button className="new-game" disabled={loading} onClick={startGame}>{game ? 'New game' : 'Start game'}</button>
        </div>

        {savedGames.length > 0 && <aside className="game-shelf" aria-label="Saved games">
          <span className="shelf-label">Your games</span>
          <div className="saved-game-list">
            {savedGames.map((saved) => <div className="saved-game-wrap" key={saved.id}>
              <button
                aria-label={`${saved.word_length} letters, ${saved.status === 'active' ? `${saved.guesses_remaining} left` : saved.status}`}
                className={`saved-game ${saved.id === game?.id ? 'current' : ''}`}
                disabled={loading}
                onClick={() => restoreGame(saved.id)}
              >
                <SavedGameThumbnail saved={saved} />
              </button>
              <button className="remove-game" aria-label={`Remove ${saved.word_length}-letter game`} disabled={loading} onClick={() => removeGame(saved.id)}>×</button>
            </div>)}
          </div>
        </aside>}

        {!game && <div className="welcome"><span>✦</span><p>Choose a word length and begin when you are ready.</p></div>}
        {game && <>
          <div className="game-meta"><strong>{game.word_length}-letter Wordle</strong><span>{game.guesses_remaining} tries left</span></div>
          <Board game={game} draft={draft} />
          <p className="draft-reader" aria-label="Current guess">{draft}</p>
          {complete && <div className={`completion ${game.status}`} role="status">
            <strong>{game.status === 'won' ? 'Nicely solved.' : 'The word got away.'}</strong>
            <span>The answer was <b>{game.answer?.toUpperCase()}</b>.</span>
          </div>}
          {!complete && <Keyboard states={keyboardStates} disabled={loading} onKey={handleKey} />}
        </>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default App
