// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ listRegions: vi.fn(), register: vi.fn(), resendVerificationEmail: vi.fn() }))
vi.mock('../src/api/client', () => ({ api }))
vi.mock('../src/hooks/useAuth.jsx', () => ({ useAuth: () => ({ setSessionFromResponse: vi.fn() }) }))
import Register from '../src/pages/Register'

beforeEach(() => {
  api.listRegions.mockResolvedValue([{ id: 'bne-id', name: 'Brisbane' }, { id: 'mel-id', name: 'Melbourne' }])
  api.register.mockResolvedValue({ requiresVerification: true, player: { id: 'p' } })
})
afterEach(cleanup)

function fill() {
  const set = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  set('First name', 'New'); set('Last name', 'Player'); set('Email', 'new@example.test')
  set('Password', 'long-enough'); set('Confirm password', 'long-enough')
}
const renderPage = () => render(<MemoryRouter><Register /></MemoryRouter>)

it('offers the listed regions as a required choice with no preselection', async () => {
  renderPage()
  const select = screen.getByLabelText('Region')
  await waitFor(() => expect(screen.getByRole('option', { name: 'Melbourne' })).toBeTruthy())
  expect(select.required).toBe(true)
  expect(select.value).toBe('')
})

it('blocks signup until a region is selected', async () => {
  renderPage()
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByText('Please choose your region')).toBeTruthy()
  expect(api.register).not.toHaveBeenCalled()
})

it('submits exactly the selected region ID', async () => {
  renderPage()
  await screen.findByRole('option', { name: 'Melbourne' })
  fill()
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'mel-id' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await waitFor(() => expect(api.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.test', region_id: 'mel-id' })))
})

it('reports a region-list failure instead of showing an empty picker silently', async () => {
  api.listRegions.mockRejectedValue(new Error('offline'))
  renderPage()
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load regions')
})
