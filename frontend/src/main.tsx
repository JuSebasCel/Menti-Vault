import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '@/app/App'
import { aplicarAparienciaGuardada } from '@/shared/tema/apariencia'
import '@/styles/index.css'

/*
  La ruta base sale de Vite (`base` en vite.config.ts): `/` en desarrollo y
  `/apps/vault/` en producción. Sin la barra final, porque React Router
  compara el inicio de la ruta literalmente y `/apps/vault` —sin barra— no
  empezaría por `/apps/vault/`: esa entrada no pintaría nada.
*/
const rutaBase = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

/* Antes del primer render, como el tema: si no, se pinta un cuadro con el acento de fábrica. */
aplicarAparienciaGuardada()

const contenedor = document.getElementById('root')

if (!contenedor) {
  throw new Error('No se encontró el elemento raíz #root en el documento.')
}

createRoot(contenedor).render(
  <StrictMode>
    <BrowserRouter basename={rutaBase}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
