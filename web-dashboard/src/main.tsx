// ============================================================
// VIRUX Web Dashboard — Application Root
// ============================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Initialize Firebase before anything else renders
// The import triggers singleton initialization
import './firebase/firebaseConfig'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('[VIRUX] Root element #root not found in index.html.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
