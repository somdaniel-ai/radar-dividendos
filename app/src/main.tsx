import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { apanharErroEntrada } from './lib/entrada'

// um erro ao entrar (ex.: registos fechados) vem no endereço: tem de ser lido antes do router
apanharErroEntrada()

// app instalável e utilizável sem rede (dados da última visita)
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
