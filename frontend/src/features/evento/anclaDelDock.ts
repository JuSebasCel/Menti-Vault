/*
  El botón del dock que abrió una acción ("Nueva memoria", "Subir
  grabación"…), para que su modal nazca de ahí y no del botón de la página
  a la que se navegó. El dock no se desmonta al cambiar de sección, así que
  el elemento sigue vivo cuando la pantalla de destino abre el modal.

  Es un objeto con `current`, la misma forma que una ref de React, para
  pasarlo tal cual a `anclaEn`.
*/
export const anclaDelDock: { current: HTMLElement | null } = { current: null }

/** El parámetro que marca que la acción llegó desde el dock. */
export const DESDE_EL_DOCK = 'desde'
