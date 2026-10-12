import { createRoot } from 'react-dom/client'
import App from './App'
import './app.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('index.html enthält kein #root-Element')

// Bewusst ohne <StrictMode>: der Universe-Hintergrund hält einen WebGL-Kontext auf genau
// einem Canvas. Der Doppel-Mount im Dev-Modus würde den ersten Kontext sofort wieder
// verwerfen und die Fläche schwarz lassen.
createRoot(rootElement).render(<App />)
