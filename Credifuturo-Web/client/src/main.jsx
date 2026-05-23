import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import GlobalErrorBoundary from './components/GlobalErrorBoundary'
import { UiProvider } from './context/UiContext'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <GlobalErrorBoundary>
            <UiProvider>
                <App />
            </UiProvider>
        </GlobalErrorBoundary>
    </React.StrictMode>,
)
