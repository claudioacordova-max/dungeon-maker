# Dungeon Maker

Juego web 3D basado en Vite, React, TypeScript, Three.js y React Three Fiber, creado desde el cascarón de juego de la plantilla (lienzo a pantalla completa, HUD superpuesto y pantallas título/jugando/pausa/fin).

## Requisitos

- Node.js 20.19+ o 22.12+
- npm

## Uso

Desde esta carpeta, instala las dependencias y arranca el servidor de desarrollo:

```sh
npm install
npm run dev
```

Abre en el navegador la dirección local que muestra Vite (normalmente `http://localhost:5173`).

Para compilar y previsualizar la versión de producción:

```sh
npm run build
npm run preview
```

## Plataforma objetivo

Cada juego se especializa en una sola plataforma, declarada en `factory.json` en la raíz (`{ "target": "..." }`); el generador de la Factory la escribe con `--target`. Diseña, implementa y prueba solo para ella: fuera de su objetivo el juego no se adapta.

| `target` | Pantalla | Entrada principal |
|---|---|---|
| `desktop` (por defecto) | Lienzo fluido a toda la ventana (referencia 1440×900 y 1024×768) | Teclado y ratón |
| `mobile-portrait` | Escenario fijo de 390×844 | Táctil |
| `mobile-landscape` | Escenario fijo de 844×390 | Táctil |

En los perfiles móviles el juego vive en un escenario de proporción fija, escalado para caber en la zona segura de la pantalla y centrado; si la pantalla tiene otra proporción, el fondo de la página queda como bandas. Los controles miden al menos 44 px de diseño, no dependen del hover ni del teclado, la pausa es un botón siempre visible y los gestos del navegador (zoom, desplazamiento, selección) están desactivados. En un dispositivo táctil girado se muestra «Gira el dispositivo».

Para probar en un teléfono de la misma red local:

```sh
npm run dev -- --host
```

y abre en el teléfono la dirección `Network` que muestra Vite.

## Estructura del cascarón

El juego ocupa toda la ventana (o todo su escenario, en móvil): sin scroll del documento, sin cabecera de página ni columna centrada. Amplía esta estructura; no la sustituyas por una maqueta de página web.

| Ruta | Qué va ahí |
|---|---|
| `factory.json` | Plataforma objetivo del juego (ver arriba). |
| `src/App.tsx` | Composición: lienzo 3D a pantalla completa (o dentro del escenario móvil) + capa de UI encima + `KeyboardControls`. |
| `src/game/store.ts` | Estado del juego con `zustand`: máquina de pantallas (`title` → `playing` ⇄ `paused` → `gameover`) y estado de la partida. Fuera de React: `useGame.getState()`. |
| `src/game/target.ts` | Lee `factory.json` y expone el perfil al código. |
| `src/game/input.ts` | Mapa de teclas (`Esc` alterna la pausa). Teclas mantenidas: `useKeyboardControls()` de drei en la escena. En móvil, las acciones táctiles son controles en pantalla o eventos de puntero de la escena. |
| `src/scene/` | Mundo 3D. `PrototypeScene` es relleno: sustitúyelo. |
| `src/ui/GameUi.tsx` | Capa superpuesta: elige HUD y pantallas según el estado. |
| `src/ui/Hud.tsx` | Información anclada a esquinas y bordes (iconos y números). |
| `src/ui/screens.tsx` | Pantallas de título, pausa y fin; accesibles con la entrada del perfil (teclado y puntero en escritorio, toque en móvil). |
| `src/ui/tokens.css` | Tipografía, colores, paneles, estados de botón y espaciado: cambia aquí el aspecto. |
| `src/ui/shell.css` | Estructura del cascarón (viewport, escenario móvil, capa de UI, HUD, pantallas). |

La capa de UI tiene `pointer-events: none`; solo sus controles y pantallas reciben el puntero, así la escena sigue siendo interactiva. En escritorio la UI escala con la altura de la ventana respecto a 720 px (`--ui-px` en `tokens.css`), sin bandas ni reorganización tipo web; en móvil `--ui-px` es un píxel de diseño del escenario. Los textos de la UI van en español.

El contador de tiempo, los clics o toques en el cubo y la escena son marcadores de posición para comprobar el cascarón; reemplázalos por el estado y la información reales del juego.

Amplía el cascarón y sustituye la escena y los marcadores de posición según la especificación aprobada para este juego.
