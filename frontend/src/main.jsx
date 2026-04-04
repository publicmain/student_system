import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import App from './App.jsx'
import './index.css'

let currentRoot = null
let currentContainerId = null

function mount(containerId) {
  const el = document.getElementById(containerId)
  if (!el) return

  // 如果已在同一容器上挂载，先卸载
  if (currentRoot && currentContainerId === containerId) {
    currentRoot.unmount()
  }

  currentRoot = ReactDOM.createRoot(el)
  currentContainerId = containerId
  currentRoot.render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>
  )
}

// SPA 动态挂载入口
window.__mountReactApp = mount

// 默认挂载
const target = document.getElementById('command-center-root') || document.getElementById('root')
if (target) {
  mount(target.id)
}
