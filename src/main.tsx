import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Initialize the conversation store (data core). Exposes useChatStore on
// window in dev so the store can be inspected from the browser console.
import '@/store/chatStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
