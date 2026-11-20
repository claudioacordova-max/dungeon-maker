# Diseño

Documento vivo del juego en modo ágil. Las secciones **del diseñador** solo cambian cuando el diseñador lo pide o lo aprueba; el agente nunca altera en silencio sus reglas ni sus números. Las secciones **del agente** las mantiene el agente al día.

## Idea

<!-- Del diseñador. -->
Mazmorra multijugador asimétrica para el móvil: un jugador es el **máster** de la mazmorra y construye en tiempo real las salas que vienen, mientras una party cooperativa de **héroes** (1 a 4) las recorre. Como un Mario Maker en tiempo real, con héroes de dungeon crawler muy simple (estilo Diablo antiguo, más simple aún).

Primera meta: prueba de concepto para comprobar si funciona el momento central, los héroes avanzan mientras el máster les prepara lo siguiente.

## Reglas

<!-- Del diseñador. Acordadas el 2026-11-20 para la prueba de concepto. -->
- **Sala de juego estilo Pinturillo:** sin registro, solo un nombre. Alguien crea una sala con código; los demás entran con el código y todos se ven en la lista. Alguien elige "Ser el máster"; el anfitrión empieza cuando hay un máster y al menos un héroe (máximo cuatro héroes).
- **Habitaciones** estilo Binding of Isaac, con vista cenital y pantalla vertical. Al vencer a todos los enemigos de la sala se abre la puerta; los héroes pasan a la siguiente sala, que es la que el máster dejó preparada. Si no preparó nada, es una sala vacía y el juego nunca se detiene.
- **Máster:** ve a los héroes en vivo y solo edita la **siguiente** sala, nunca la actual. Coloca enemigos, trampas y cofres pagando con puntos.
- **Puntos del máster:** empieza con algunos y gana más cada vez que un héroe recibe daño. Si el máster es cruel puede encadenar ventaja; se acepta así en esta prueba (el diseñador tiene ideas para corregirlo después).
- **Héroes:** joystick con el pulgar para moverse y **botón de atacar**, que golpea al enemigo más cercano a su alcance (cambio del diseñador, 2026-11-20; antes era automático).
- **Daño y vidas:** cada héroe tiene su propia barra de golpes. Al vaciarse, el héroe cae, el equipo pierde una **vida grupal** y el héroe reaparece en la entrada de la sala tras unos segundos, con la barra llena. Las heridas se mantienen de sala en sala; los cofres curan.
- **Final:** ganan los héroes al salir por la puerta de la última sala. Gana el máster si el equipo se queda sin vidas grupales.
- Fuera de esta prueba: clases, subir de nivel, equipamiento, acertijos, pistas y la corrección del encadenamiento de ventaja del máster.

## Números

<!-- Del diseñador. Valores para la prueba; los marcados como propuesta los eligió el agente y se ajustan jugando. -->
- Vidas grupales del equipo: 3.
- Golpes que aguanta un héroe: 4.
- Salas para ganar: 5.
- Puntos iniciales del máster: 10 (propuesta). Por cada golpe que recibe un héroe: +1 (propuesta).
- Coste: enemigo 2, trampa 1, cofre 0 (propuesta).
- Cofre: cura 2 golpes al héroe que lo toca (propuesta).
- Reaparición tras caer: 1 s (diseñador, 2026-11-20).
- La primera sala trae 2 enemigos de serie, para que haya algo que hacer mientras el máster prepara la segunda (propuesta).

## Preguntas abiertas

<!-- Del diseñador. -->
- Cómo evitar que el máster que va ganando gane cada vez más (el diseñador tiene ideas para después).
- Si los roles y clases de los héroes se eligen en la sala de juego o al empezar.
- Progresión de los héroes: recompensas, equipamiento y niveles.
- Si se limita al máster por recursos o se le deja libertad total.

## Plan actual

<!-- Del agente. -->
Prueba de concepto multijugador, sin dependencias nuevas (el servidor de cada sala es un Durable Object en el mismo Worker de Cloudflare; se prueba en la versión desplegada):

1. [x] Salas: crear, entrar con código, lista de jugadores, elegir máster y empezar.
2. [x] Héroes juntos: moverse en una sala y verse en tiempo real.
3. [x] Máster: colocar enemigos, trampas y cofres en la siguiente sala con sus puntos; puertas.
4. [x] Combate: enemigos que persiguen, ataque automático, golpes, vidas grupales, cofres y final para cada bando.

## Estado

<!-- Del agente. -->
Prueba de concepto jugable en la versión desplegada (2026-11-20): salas con código, lista de jugadores, elección de máster, héroes con joystick (o WASD en el PC) y ataque automático, máster que prepara la siguiente sala con sus puntos, golpes, vidas grupales, cofres, puertas y final para cada bando.

- Comprobado con dos jugadores simulados contra el servidor desplegado; aún no probado por personas en dos dispositivos.
- Si el máster se desconecta, la partida vuelve a la sala de espera; si la sala se queda vacía, su código deja de existir.
- Los nombres de los héroes solo aparecen en la lista de la esquina, no sobre los personajes.
- 2026-11-20, tras la primera prueba del diseñador: botón de atacar, reaparición en 1 s y trabajo sobre el lag (el propio héroe se mueve al instante en su pantalla y se corrige con el servidor; los demás se dibujan interpolados; el joystick se envía en cuanto cambia; resolución limitada a ×2). Arriba a la derecha se muestra la latencia con el servidor de la sala.
- Latencia medida el 2026-11-20 desde la red del diseñador: unos 190 ms de ida y vuelta al servidor de la sala, y casi lo mismo (unos 200 ms) a una respuesta simple del Worker sin sala. El retraso está en el camino hasta Cloudflare (las peticiones salen por São Paulo), no en el servidor de la sala; pedir que la sala se cree en Sudamérica no lo cambió. Con la predicción el propio héroe responde al instante; enemigos, otros héroes y el efecto de los golpes se ven unos 0,3 s tarde.
