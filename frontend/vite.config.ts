import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { fileURLToPath, URL } from 'node:url'

/*
  En producción la app vive en `menti.site/apps/vault`: la raíz del dominio
  queda para una futura página que reúna todas las apps. La salida se escribe
  en `dist/apps/vault` para que la ruta de cada archivo en disco sea la misma
  que en la URL; si se dejara en `dist/` con `base` apuntando a otra ruta,
  Vercel no encontraría los recursos y haría falta reescribirlos uno por uno.

  Solo al construir: en desarrollo la app sigue en la raíz de
  `localhost:5173`, que es el origen que el backend acepta por CORS.
*/
const RUTA_EN_PRODUCCION = '/apps/vault/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? RUTA_EN_PRODUCCION : '/',
  build: {
    outDir: command === 'build' ? `dist${RUTA_EN_PRODUCCION}` : 'dist',
    emptyOutDir: true,
  },
  /*
    `docx-templates` (F4, generación de vistas previas de .docx) usa el
    global `Buffer` de Node internamente al construir el XML de salida.
    `nodePolyfills` inyecta ese global (y `process`, por si alguna
    dependencia transitiva también lo espera) solo para el bundle del
    cliente — dev y build, nunca en pruebas (`process.env.VITEST`): Vitest ya
    corre sobre Node real, donde esos globales existen de forma nativa, y el
    polyfill llegaba a interceptar módulos propios de Node como `node:url`
    (usado por las pruebas para resolver rutas de archivos de ejemplo),
    rompiendo su resolución con un shim pensado solo para el navegador.
  */
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [nodePolyfills({ globals: { Buffer: true, process: true, global: true } })]),
  ],
  /*
    ffmpeg.wasm arranca su propio worker con `new URL(..., import.meta.url)`;
    si Vite lo preempaqueta, esa URL deja de apuntar al archivo real y el
    worker no carga. Por eso se sirve tal cual.
  */
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    /*
      Configuración de Supabase para las pruebas. `cliente.ts` valida sus dos
      variables al importarse y lanza si falta alguna, así que sin esto
      cualquier archivo que llegue a `@/shared/supabase/cliente` por una
      cadena de imports —aunque después lo reemplace con `vi.mock`— falla al
      cargar el módulo, antes de correr una sola prueba.

      Son valores sintéticos con la forma que espera `createClient`, nunca los
      de un proyecto real: ninguna prueba de esta suite toca la red. Las que
      sí hablan con Supabase de verdad viven aparte, en `supabase/tests/`.
    */
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'anon-key-de-prueba',
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,
    /*
      Tope de procesos worker. Sin esto Vitest abre uno por núcleo, y cada uno
      con jsdom + esta suite carga entre 0,8 y 2 GB: en una máquina de 8 núcleos
      son más de 10 GB solo en pruebas, suficiente para dejar el equipo sin RAM.
      Tres es el punto donde la suite completa sigue tardando poco sin que el
      pico de memoria se dispare.
    */
    maxWorkers: 3,
    /*
      Los cinco segundos que trae Vitest por defecto se quedaron cortos al pasar
      la suite de 129 a 352 pruebas. Las de acceso y registro escriben en los
      campos tecla a tecla y calculan de verdad un resumen SHA-256 con
      `crypto.subtle`, así que con varios archivos corriendo en paralelo rozan
      el límite: aisladas pasan siempre, y en la suite completa caían unas u
      otras según la corrida.

      El fallo era de tiempo agotado, nunca de aserción. Subir el margen no
      esconde un defecto de comportamiento; el día que una de estas pruebas
      tarde quince segundos, eso sí será una señal que valga la pena mirar.
    */
    testTimeout: 15_000,
  },
}))
