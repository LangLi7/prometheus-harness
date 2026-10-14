/**
 * Der Einstieg der Anmeldeseite.
 *
 * @module @prometheus-harness/login-web/main
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './style.css'

const behaelter = document.getElementById('wurzel')
if (behaelter === null) throw new Error('Der Behälter #wurzel fehlt in index.html.')

createRoot(behaelter).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
