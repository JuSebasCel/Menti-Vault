import type { Memoria } from './tipos'

/**
 * Material de prueba, ya no semilla de la aplicación: desde B6 el listado sale
 * de la tabla `memorias` de Supabase (`repositorio.ts`). Se conserva porque
 * las pruebas de filtrado y de listado necesitan una memoria bien formada que
 * referencie una conferencia del fixture de conferencias (`cnf-alc-01`).
 */
export const MEMORIAS_DE_EJEMPLO: readonly Memoria[] = [
  {
    id: 'mem-alc-01',
    idConferencia: 'cnf-alc-01',
    idPlantilla: 'pla-memoria-estandar',
    idDueno: '1ba5af9a-f6a2-4504-ab60-1f018c21290a',
    nombre: 'Memoria de Modelos de lenguaje aplicados a la revisión sistemática de literatura',
    generadaEl: '2026-04-15T10:00:00.000Z',
    estado: 'lista' as const,
  },
]
