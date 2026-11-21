import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { pedirAlmacenamientoPersistente } from './lib/storage.ts'
import { iniciarSincronizacion } from './sync/sincronizacion.ts'

registerSW({ immediate: true })
void pedirAlmacenamientoPersistente()
iniciarSincronizacion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
