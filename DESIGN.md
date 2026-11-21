# Diseño

Documento vivo del juego en modo ágil. Las secciones **del diseñador** solo cambian cuando el diseñador lo pide o lo aprueba; el agente nunca altera en silencio sus reglas ni sus números. Las secciones **del agente** las mantiene el agente al día.

## Idea

<!-- Del diseñador. -->
Mazmorra multijugador asimétrica para el móvil: un jugador es el **máster** de la mazmorra y construye en tiempo real el mapa que viene, mientras una party cooperativa de **héroes** (1 a 4) lo recorre. Como un Mario Maker en tiempo real, con héroes de acción móvil.

Aspecto y sensación de un juego de acción móvil al estilo de Brawl Stars: modelos 3D con animaciones, controles sobre la pantalla de juego, interfaz y menús coherentes con ese estilo. Debe correr fluido en el celular.

## Reglas

<!-- Del diseñador. Prueba de concepto acordada el 2026-11-20; segunda versión el 2026-11-20 (marcada «v2»). -->
- **Sala de juego estilo Pinturillo:** sin registro, solo un nombre. Alguien crea una sala con código; los demás entran con el código y todos se ven en la lista. Alguien elige "Ser el máster"; el anfitrión empieza cuando hay un máster y al menos un héroe (máximo cuatro héroes).
- **Clases (v2):** cada héroe elige su clase en la sala de espera; se pueden repetir.
  - **Cuerpo a cuerpo:** ataque básico en un cono corto hacia el frente (un golpe de hoja). Manteniendo presionado se carga un ataque en círculo alrededor, de mayor alcance.
  - **A distancia:** ataque básico con un disparo. Manteniendo presionado se carga un disparo certero, que es crítico.
  - **Sacerdotisa elfa** (2026-11-20): usa maná, que se recarga con el tiempo. Básico: un orbe de luz que daña al enemigo que toca y cura al aliado que toca (atraviesa aliados). Potenciado: una oración que cura a todos los aliados cercanos, ella incluida.
  - **Mago anciano** (2026-11-20): usa maná, que se recarga con el tiempo. Básico: una chispa que daña y deja al enemigo quemado (un poco de daño durante unos segundos). Potenciado: polimorfia, que convierte a un enemigo en una gallina indefensa durante unos segundos; el jefe también se transforma, pero mucho menos tiempo. El daño no deshace la transformación.
- **Mapa por habitaciones (v2):** el máster construye habitaciones hacia el frente y hacia los costados, y puede ir adelantando varias en paralelo mientras los héroes avanzan. Hasta 6 habitaciones y después una habitación de jefe, que siempre es la última en colocarse.
- **Puerta a una habitación sin terminar (v2):** queda cerrada hasta que el máster la marque como lista; si el máster se atrasa, los héroes esperan.
- **Dificultad por habitación (v2):** cada habitación tiene un tope de dificultad. Los elementos negativos suman (enemigos, trampas) y los positivos restan (cofres); el total no puede pasar el tope. Valor estático por ahora; se balanceará según la fuerza de los héroes. El máster ya no gana puntos cuando los héroes reciben daño.
- **Enemigos (v2):** un **slime** que hace daño al tocar a los héroes, y un enemigo **a distancia** que lanza proyectiles. Jefe: **slime gigante**.
- **Ogro** (2026-11-20): enemigo grande y poderoso, más caro en dificultad.
- **Tope por héroe** (2026-11-20): el tope de dificultad de cada sala sube por cada héroe extra en la partida.
- **Sala del jefe por fases** (2026-11-20, solución temporal): primero aparecen los enemigos que el máster puso en la sala; al derrotarlos aparece el jefe.
- **Ataques enemigos anunciados** (2026-11-20): antes de golpear, el enemigo se detiene y marca en el suelo una zona roja que se llena; al llenarse, golpea a quien esté dentro. Golpear a un enemigo lo deja aturdido un instante.
- **Controles (v2):** sobre la pantalla de juego, como en los juegos móviles: joystick de movimiento abajo a la izquierda y ataque abajo a la derecha.
- **Daño y vidas:** cada héroe tiene su propia barra de golpes. Al vaciarse, el héroe cae, el equipo pierde una **vida grupal** y el héroe reaparece tras unos segundos con la barra llena. Las heridas se mantienen de habitación en habitación; los cofres curan.
- **Cofres** (diseñador, 2026-11-20): se abren al golpearlos (corte o disparo) y dan su beneficio al héroe que los golpeó; pasar por encima no hace nada.
- **Final (v2):** ganan los héroes al derrotar al jefe. Gana el máster si el equipo se queda sin vidas grupales.
- Fuera de esta versión: subir de nivel, equipamiento, acertijos, pistas.

## Números

<!-- Del diseñador. Los marcados como propuesta los eligió el agente y se ajustan jugando. -->
- Vidas grupales del equipo: 3.
- Golpes que aguanta un héroe: 4.
- Habitaciones del máster: hasta 6, más la del jefe (diseñador, v2).
- Tope de dificultad por habitación: 10 (diseñador dijo «10 o 6»; se empieza con 10), +5 por cada héroe después del primero (diseñador): 10, 15, 20, 25.
- Dificultad: enemigo +2 (diseñador), enemigo a distancia +3 (propuesta), ogro +5 (propuesta), trampa +1 (propuesta), cofre −5 (diseñador).
- Ogro (propuesta): 10 de vida, lento, no daña al tocar; golpe de garrote anunciado con zona roja frente a él que quita 2 golpes; queda expuesto un momento tras golpear.
- Sacerdotisa (aprobado): maná 4, recupera 1 cada 1,5 s. Orbe de luz: 1 de maná, quita 1 a un enemigo o cura 1 golpe a un aliado. Oración: 3 de maná, cura 1 golpe a los aliados en 3,5 m.
- Mago (aprobado): maná 5, recupera 1 cada 1,2 s. Chispa: 1 de maná, quita 1 y quema 0,5 por segundo durante 2 s (la quemadura se reinicia, no se acumula, y no aturde). Polimorfia: 3 de maná, gallina durante 4 s; el jefe 1,5 s y después no puede volver a transformarse durante 8 s. La gallina no ataca, no daña al tocar, cancela el ataque que estaba anunciando y huye de los héroes.
- Cofre: cura 2 golpes al héroe que lo toca (propuesta).
- Reaparición tras caer: 1 s (diseñador).
- Aviso de ataque enemigo: 0,5 s (diseñador). Aturdimiento del enemigo golpeado: 0,25 s (propuesta).
- La habitación inicial trae 2 slimes de serie (propuesta).
- Carga del ataque potenciado: 0,6 s manteniendo presionado (propuesta). Vida del jefe: 30 golpes básicos (propuesta).

## Preguntas abiertas

<!-- Del diseñador. -->
- Balance del tope de dificultad según la fuerza de los héroes (el diseñador lo ajustará).
- Si conviene limitar cuántos cofres caben en una habitación (hoy un cofre libera 5 de dificultad).
- Progresión de los héroes: recompensas, equipamiento y niveles.

## Decisiones del agente (v2, por confirmar jugando)

<!-- Del agente: huecos que la petición no cubría. -->
- La habitación inicial existe desde el principio y no cuenta entre las 6. El máster solo puede añadir habitaciones contiguas a una existente (arriba, izquierda o derecha); no puede editar una habitación donde ya entró un héroe.
- Una puerta entre dos habitaciones se abre cuando ambas están listas y al menos una ya no tiene enemigos. Así los héroes entran a pelear y pueden volver atrás por donde vinieron.
- Los enemigos solo actúan cuando hay un héroe en su habitación y no salen de ella.
- Un héroe caído reaparece junto a un compañero vivo, o en la habitación inicial si no queda ninguno.
- Cámara inclinada que sigue a cada héroe; el máster ve el mapa completo desde arriba y puede acercarse a una habitación para editarla.
- Apuntar como en los juegos de acción móviles: tocar el botón de ataque apunta solo al enemigo más cercano; arrastrarlo apunta a mano.

## Red

<!-- Del agente. Acordado con el diseñador el 2026-11-20. -->
Una sola partida compartida, en el servidor de la sala. Para que las acciones propias se sientan inmediatas con 200–350 ms de latencia:

- **El dispositivo de cada héroe decide:** dónde está su héroe (el servidor solo limita la velocidad), a qué enemigo golpeó según lo que veía (el servidor lo comprueba contra dónde estaba ese enemigo en ese momento) y si una zona roja lo alcanzó (si en su pantalla esquivó, esquivó).
- **El servidor decide todo lo compartido:** vida y muerte de los enemigos, vidas del equipo, trampas y cofres, puertas, salas y lo que pone el máster.
- Los demás héroes y los enemigos se ven unos 0,1–0,3 s en el pasado, interpolados.
- Herramientas de prueba en la URL: `?lag=300` añade 300 ms de ida y vuelta para probar el peor caso; `?ghost` dibuja en alambre dónde tiene el servidor cada héroe y enemigo.

## Plan anterior

<!-- Del agente. -->
Red con acciones propias inmediatas (2026-11-20):

1. [x] Simulador de lag y posición del héroe decidida en su dispositivo.
2. [x] Golpes resueltos en pantalla y validados en el servidor.
3. [x] Ataques enemigos anunciados y aturdimiento.
4. [x] Fantasmas de depuración.

Anterior, prueba de concepto multijugador, sin dependencias nuevas (el servidor de cada sala es un Durable Object en el mismo Worker de Cloudflare; se prueba en la versión desplegada):

1. [x] Salas: crear, entrar con código, lista de jugadores, elegir máster y empezar.
2. [x] Héroes juntos: moverse en una sala y verse en tiempo real.
3. [x] Máster: colocar enemigos, trampas y cofres en la siguiente sala con sus puntos; puertas.
4. [x] Combate: enemigos que persiguen, ataque automático, golpes, vidas grupales, cofres y final para cada bando.

## Plan actual (2026-11-20, cuatro clases)

1. [x] Maná, sacerdotisa y mago (mecánica, HUD y sala de espera).
2. [x] Ogro, tope por héroe extra y sala del jefe por fases.
3. [x] Modelos de Codex (GPT-6.2-Astra): sacerdotisa, mago, ogro, gallina, efectos y tarjetas.

## Estado

<!-- Del agente. -->
Versión 2 desplegada (2026-11-20):

- Sala de espera con elección de clase (Espadachín cuerpo a cuerpo, Arquera a distancia) y estética de juego de acción móvil.
- Mapa por habitaciones: el máster construye al norte, este u oeste, hasta 6 salas y después la del jefe; edita cada sala con el medidor de dificultad (tope 10) y la marca lista; puede volver a editarla mientras ningún héroe haya entrado.
- Héroes con joystick flotante a la izquierda y palanca de ataque a la derecha: tocar ataca apuntando solo, arrastrar apunta a mano, mantener 0,6 s carga el ataque potenciado (círculo del espadachín, disparo crítico de la arquera).
- Enemigos: slime (daño al tocar), lanzador (apunta 0,5 s con una línea roja y lanza orbes), rey slime (salta sobre los héroes con zona roja y escupe abanicos de orbes). Ganan los héroes al derrotar al jefe.
- Modelos 3D, animaciones, mazmorra y efectos hechos por Codex (GPT-6.2-Astra) en `src/models/`; vitrina en `?models`.
- 2026-11-20: el máster usa en el celular un minimapa con botones (habitaciones y "+" para construir), en vez de tocar las zonas del mapa 3D.
- 2026-11-20: sonido generado en el navegador (sin archivos): ataques, golpes, golpes críticos, carga completa, daño, caída y reaparición de héroes, muertes de cada enemigo, lanzamiento de orbes, aviso y aterrizaje del jefe, puertas que se abren, cofres, construcción y colocación del máster, botones, fanfarria de victoria y de derrota, y una música suave de mazmorra. Botón de silencio arriba a la derecha (se recuerda en cada dispositivo).
- 2026-11-20: música y efectos se pueden silenciar por separado (botón de sonido, arriba a la derecha). Para volver a editar una sala ya lista, el máster debe confirmarlo, y el botón «Sala lista» espera la respuesta del servidor (posible causa de que una sala dejara de estar lista; no se pudo reproducir).
- 2026-11-20: menús rediseñados según las referencias del diseñador (piedra morada, dorado, antorchas): portada con logo y escena ilustrada, sala con código en placa, lista de jugadores y tarjetas de papel (Maestro de mazmorra, Espadachín, Arquera), botón Invitar que comparte el código, pantalla final con ilustración de victoria o derrota, favicon. Imágenes generadas por Codex (GPT-6.2-Astra) en `public/ui/` (~930 KB).
- 2026-11-20: tipografía Lilita One (licencia OFL, servida desde `public/fonts/`), pantalla de carga centrada con barra («Abriendo la mazmorra…», «Preparando la mazmorra…»), tarjetas de héroes del mismo tamaño (la del máster algo mayor). Los menús cargan aparte del 3D: el paquete inicial bajó de 1,24 MB a 263 KB y el 3D se descarga en segundo plano desde la sala.
- 2026-11-20: reconexión automática. Si el teléfono pausa la página (por ejemplo al compartir el código por WhatsApp) y la conexión muere, el juego vuelve solo a la misma sala como el mismo jugador; el servidor guarda su puesto 30 s. La elección de tarjeta se marca al instante y se corrige si el servidor la rechaza.
- Ajuste del agente: 2 s de protección al reaparecer (antes un héroe podía morir varias veces seguidas junto a los slimes).

- 2026-11-21: cuatro clases. **Sacerdotisa elfa** (orbe de luz que daña o cura y atraviesa aliados; oración que cura a los cercanos) y **Mago anciano** (chispa que quema; polimorfia que convierte en gallina), ambos con maná visible sobre el botón de ataque. **Ogro** en la paleta del máster (+5). Tope de dificultad según los héroes de la partida (10/15/20/25). En la sala del jefe, el jefe aparece cuando caen los enemigos que puso el máster. Modelos, efectos y tarjetas nuevos por Codex (GPT-6.2-Astra, xhigh); vitrina en `?models`.

Problemas conocidos:
- Las etiquetas de nombre sobre los héroes provocan a veces un aviso de React en la consola al empezar la partida («synchronously unmount a root»); no afecta al juego.
- Los slimes son muy letales contra un héroe que no se mueve: en la prueba automática el héroe perdió 2 vidas en la primera sala. Para balancear jugando.
- Rendimiento en un teléfono real sin medir (Codex estimó ~1.500 triángulos y ≤8 llamadas de dibujo por personaje).
- El paquete del juego pesa ~1,2 MB (343 KB comprimido).
