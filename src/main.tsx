import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './ui/App'

/** 动效档位存本地，低端机可在设置里降级。 */
const anim = localStorage.getItem('ga:anim') ?? 'full'
document.documentElement.dataset.anim = anim

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
