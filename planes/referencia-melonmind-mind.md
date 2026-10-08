# Referencia visual: melonmind.app/apps/mind

Medido el 2026-10-08 con estilos computados y muestreo cuadro a cuadro
(`requestAnimationFrame`), no a ojo. Es la misma familia Material 3 de la que
salió el lenguaje actual (mismos tokens, `surface` `#fbf9fc`); cambia el
dialecto: claro, iconos en el dock, tarjetas tipo bento.

Todavía no es una decisión aprobada: cuando lo sea, lo que se adopte pasa a
`.claude/skills/diseno-visual/SKILL.md`.

## Tokens (tema claro)

| Token | Valor |
|---|---|
| background / surface / surface-bright | `#fbf9fc` |
| surface-container-lowest | `#ffffff` |
| surface-container-low | `#f5f3f6` (tarjeta rellena, campos) |
| surface-container | `#efedf0` (chip apagado) |
| surface-container-high | `#e9e7ea` (borde de tarjeta) |
| surface-variant | `#e1e2eb` (hover del dock) |
| on-surface | `#1b1b1e` |
| on-surface-variant | `#44474e` |
| outline | `#75777e` (texto tenue, dock inactivo) |
| outline-variant | `#c5c6ce` |
| primary | `#000000` — el único acento |
| secondary-container | `#e0e6f8` (anillo de foco, pastilla de estado) |
| error / error-container | `#ba1a1a` / `#ffdad6` |

Tipografía: **DM Sans** en todo el contenido; el dock usa **Inter** 16/500.

## Dock

- Columna de 200px de ítems, a 12px del borde. Ítem 200×40, radio 16, icono + texto.
- Dos grupos: secciones arriba; **"Opciones" = acciones rápidas** (abren modales).
  Rótulo de grupo 11px/500 en `outline-variant`.
- Inactivo: texto `#75777e`. Hover: píldora `#e1e2eb`.
- **Activo: píldora negra con vidrio**:
  `box-shadow: 0 0 32px -10px #000, inset 0 0 0 1px rgba(255,255,255,.64), inset 0 4px 24px rgba(255,255,255,.24)`.
  No se desliza entre ítems: aparece en el nuevo y su `padding` entra con
  `0.3s cubic-bezier(0,1,0,1)`; el gris del hover se apaga en 0.1s.

## Página

- Encabezado: título 24px/400 a la izquierda; acciones a la derecha.
  Primaria: píldora negra 40px de alto, padding 10/24, 14px/500, icono `add`.
  Secundaria: píldora con borde fino. Iconos sueltos: círculo 40px.
- Contenido en **tarjetas bento**: radio 24, padding 24, separación 8px.
  Rellena `#f5f3f6` o con borde (`box-shadow: inset 0 0 0 1px #e9e7ea`).
- Cifras protagonistas: 45px/600, line-height 1. Rótulo encima 16px/500 al 80 %.
- Lista: fila de 4 tarjetas de totales + tabla dentro de una caja con borde;
  estado como pastilla tonal (`secondary-container`); acción `↗ Abrir` a la derecha.
- Vacío: icono gris grande + texto 24/500 en `outline`.

## Chips de filtro (firma de movimiento)

| | Apagado | Elegido |
|---|---|---|
| fondo / color | `#efedf0` / `#1b1b1e` | `#000` / `#fff` |
| radio | 12px | 64px |
| padding | 8px 12px | 8px 18px |

`transition: padding .4s cubic-bezier(.38,.49,0,2), border-radius .2s cubic-bezier(.38,.49,0,1.5), background .125s, color .125s`.
Medido: el padding se pasa a 20px a los ~200ms y vuelve a 18 hacia los 400ms.
El que se apaga hace lo mismo al revés.

## Modales y paneles

Todos crecen desde lo que los abrió (FLIP), movidos por JS cuadro a cuadro:

- Apertura (desde un ítem de 110×44 hasta 1200×606): `blur(32px) → 0` en ~300ms;
  la escala llega a 0.95 a los 290ms y se asienta hacia los 700ms, sin rebote
  (cola larga tipo ease-out exponencial).
- Cierre (~400ms): vuelve al botón; **el radio crece en compensación de la escala**
  (32 → ~390px) para que al encogerse termine siendo una píldora como el botón;
  la opacidad cae en la segunda mitad; blur 0 → 31px.
- Detalle de un registro: **panel lateral derecho de 800px** que nace del botón
  `Abrir` (blur 8px → 0 y opacidad 0 → 1 en ~400ms). La lista sigue visible.
- Velo `rgba(0,0,0,.1)`, sin desenfoque. Radio 32. Sin sombra.
- El contenido de dentro entra **escalonado**: cada bloque con su propio blur.

Formularios: icono + título 36/600 centrado + descripción; campos de 49px, radio 16,
fondo `#f5f3f6`, anillo de foco `0 0 0 3px #e0e6f8`, transición 0.5s.
Botonera en dos mitades: *Cancelar* tonal y acción negra con `→`.

**Asistente por pasos** para crear (nombre → contacto → resumen → hecho), con
*Atrás*, *Continuar →* y *Omitir y configurar después*. El error de validación
va en una caja tonal roja dentro del paso. Termina en una pantalla de éxito
(check + "Paciente creado" + *Salir*) y un aviso tipo toast arriba.

## Consentimientos (relevante para el producto)

El paciente tiene una pestaña **Consentimientos** con plantillas. Generar uno
muestra la declaración ya rellenada con los datos de la persona (editable), una
firma, y el texto: *se puede enviar al paciente mediante un enlace seguro para
su revisión y firma digital*. Es el mismo flujo que necesitamos para ponentes.
