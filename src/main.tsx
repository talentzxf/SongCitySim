import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'antd/dist/reset.css'
import './styles.css'

// Expose a placeholder for E2E tests early so tests don't race with app mount
try {
  ;(window as any).__CITY_STATE__ = null
} catch (e) {
  // ignore non-browser environments
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
