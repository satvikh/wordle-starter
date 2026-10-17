import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const activeGame = {
  id: 'game-1',
  word_length: 5,
  status: 'active',
  max_guesses: 6,
  guesses_used: 0,
  guesses_remaining: 6,
  guesses: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('starts a selected-length game and renders the board', async () => {
    const game = { ...activeGame, word_length: 7, max_guesses: 8, guesses_remaining: 8 }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => game })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.change(screen.getByLabelText(/word length/i), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: /start game/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/games',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ word_length: 7 }) }),
    ))
    expect(await screen.findByText('7-letter Wordle')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/empty tile/i)).toHaveLength(56)
  })

  it('accepts keyboard input and submits a full draft', async () => {
    const updatedGame = {
      ...activeGame,
      guesses_used: 1,
      guesses_remaining: 5,
      guesses: [{ id: 'guess-1', word: 'crane', feedback: ['gray', 'yellow', 'gray', 'green', 'green'], guess_number: 1 }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => activeGame })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guess: updatedGame.guesses[0], game: updatedGame }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /start game/i }))
    await screen.findByText('5-letter Wordle')
    ;['c', 'r', 'a', 'n', 'e'].forEach((key) => fireEvent.keyDown(window, { key }))
    expect(screen.getByLabelText(/current guess/i)).toHaveTextContent('CRANE')
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:8000/games/game-1/guesses',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ word: 'crane' }) }),
    ))
    expect(screen.getByLabelText(/letter c/i)).toHaveClass('gray')
  })

  it('shows server errors without clearing the draft', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => activeGame })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Guess must be a valid dictionary word' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /start game/i }))
    await screen.findByText('5-letter Wordle')
    ;['c', 'r', 'a', 'n', 'e'].forEach((key) => fireEvent.click(screen.getByRole('button', { name: key.toUpperCase() })))
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Guess must be a valid dictionary word')
    expect(screen.getByLabelText(/current guess/i)).toHaveTextContent('CRANE')
  })

  it('restores a saved game from the game shelf', async () => {
    const stored = new Map()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => stored.get(key) || null,
        setItem: (key, value) => stored.set(key, value),
      },
    })
    window.localStorage.setItem('wordle-games', JSON.stringify([
      { id: 'saved-game', word_length: 6, status: 'active', guesses_remaining: 4 },
    ]))
    const savedGame = { ...activeGame, id: 'saved-game', word_length: 6, max_guesses: 7, guesses_remaining: 4, guesses_used: 3 }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => savedGame })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /6 letters.*4 left/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/games/saved-game', undefined))
    expect(await screen.findByText('6-letter Wordle')).toBeInTheDocument()
  })

  it('removes a saved game from the server and shelf', async () => {
    const stored = new Map()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => stored.get(key) || null,
        setItem: (key, value) => stored.set(key, value),
      },
    })
    window.localStorage.setItem('wordle-games', JSON.stringify([
      { id: 'remove-me', word_length: 7, status: 'active', guesses_remaining: 5 },
    ]))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /remove 7-letter game/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/games/remove-me',
      expect.objectContaining({ method: 'DELETE' }),
    ))
    expect(screen.queryByRole('button', { name: /remove 7-letter game/i })).not.toBeInTheDocument()
  })
})
