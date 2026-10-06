import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { enablePreviewSwipe } from './lib/previewSwipe'

// 크게 띄운 사진을 끌어서 넘긴다 — 한 번만 붙인다
enablePreviewSwipe()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
