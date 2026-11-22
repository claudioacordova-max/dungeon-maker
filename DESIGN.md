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
- **Mapa por habitaciones (v2):** el máster construye habitaciones hacia el frente y hacia los costados, y puede ir adelantando varias en paralelo mientras los héroes avanzan. Hasta 5 habitaciones (antes 6; diseñador, 2026-11-21) y después una habitación de jefe, que siempre es la última en colocarse.
- **Puerta a una habitación sin terminar (v2):** queda cerrada hasta que el máster la marque como lista; si el máster se atrasa, los héroes esperan.
- **Dificultad por habitación (v2):** cada habitación tiene un tope de dificultad. Los elementos negativos suman (enemigos, trampas) y los positivos restan (cofres); el total no puede pasar el tope. Valor estático por ahora; se balanceará según la fuerza de los héroes. El máster ya no gana puntos cuando los héroes reciben daño.
- **Enemigos (v2):** un **slime** que hace daño al tocar a los héroes, y un enemigo **a distancia** que lanza proyectiles. Jefe: **slime gigante**.
- **Ogro** (2026-11-20): enemigo grande y poderoso, más caro en dificultad.
- **Tope por héroe** (2026-11-20): el tope de dificultad de cada sala sube por cada héroe extra en la partida.
- **Máster en dos partes** (2026-11-21): al editar una sala, una pestaña **Sala** (terreno) y otra **Enemigos**, que comparten el mismo tope de dificultad.
  - **Suelo roto:** la sala puede tener tramos de suelo que ya no están (no hoyos sueltos), elegidos de una lista de formas: Entera, Orillas, Cruz y Puente. Un héroe que camina más allá del borde se cae y cuenta como derrotado (el equipo pierde una vida). Es más caro que los pinchos.
  - **Pinchos:** ya no se colocan uno por uno; se compra un paquete que pone varias trampas en lugares fijos pensados para la forma del suelo.
  - **Cofres:** se elige cuántos (máximo 3) y aparecen en lugares fijos de esa forma, siempre sobre suelo y alcanzables.
- **Sala del jefe prediseñada** (2026-11-21, reemplaza la sala por fases): sin enemigos, trampas ni hoyos; el maestro solo la ubica y no la edita. Al entrar el primer héroe, una cinemática breve que no se puede saltar y que ven todos: héroes y enemigos quietos, el maestro aparece junto al jefe (verde), mira a los héroes, se vuelve, se deshace en humo morado y lo posee; el jefe se vuelve morado con los ojos del maestro. Después el maestro controla al jefe con sus ataques (salto con zona roja y abanico de orbes) hasta el final.
- **Introducción** (2026-11-21): al empezar, los héroes leen un texto fijo y breve que termina en «Entrar a la mazmorra»; la partida de los héroes empieza cuando todos lo presionan, sin límite de tiempo. Mientras tanto el maestro ya construye y ve cuántos están listos.
- **Vista Observar** (2026-11-21): además de Mapa y Construir, el maestro toca una sala con héroes y la cámara la encuadra; ahí usa sus poderes, que solo funcionan en esa sala. Si los héroes se separan, él elige cuál mirar.
- **Poseer un enemigo** (2026-11-21, habilidad principal del maestro): toca un enemigo de la sala que observa y lo controla con joystick y botón de ataque, con la misma fuerza que tiene. Sin costo, sin tiempo límite y sin espera; termina cuando lo suelta o el enemigo muere. Mientras posee, no construye.
- **Invocar un slime** (2026-11-21, secundaria): solo en una sala con héroes peleando; aparece en la puerta más lejos de los héroes; con tiempo de espera largo. Sin recurso aparte para los poderes y sin activar trampas.
- **Modelo del maestro** (2026-11-21): al construir aparece en el centro de la sala que edita y solo él lo ve; los héroes lo ven solo en la cinemática del jefe.
- **Pociones** (2026-11-21): los cofres dan pociones a un inventario compartido del equipo, como las vidas. Se usan solas, sin botón: después de un golpe, si al héroe le quedan 1 o 0 golpes y hay pociones, se gasta una y le cura (con 0 no cae). Caer al vacío no se salva con pociones. Tienen su propio sonido y un brillo de curación alrededor del héroe.
- **Panel del maestro «Mando del Maestro»** (2026-11-21, diseño C elegido entre tres bocetos): los controles van donde caen los pulgares. Construyendo: el enemigo elegido abajo a la izquierda (su lista se abre al costado, con miniatura y costo, y se abre sola al tocar el suelo sin enemigo elegido), «Sala lista» grande abajo a la derecha con Mapa encima, el terreno (suelo, pinchos, cofres) en un riel en el borde derecho y la dificultad arriba. Tocar el suelo pone el enemigo elegido; tocar un enemigo lo quita. El «+» del mapa construye la sala al instante. En Observar, los mismos lugares pasan a ser joystick y ataque o Invocar.
- **Ataques enemigos anunciados** (2026-11-20): antes de golpear, el enemigo se detiene y marca en el suelo una zona roja que se llena; al llenarse, golpea a quien esté dentro. Golpear a un enemigo lo deja aturdido un instante.
- **Controles (v2):** sobre la pantalla de juego, como en los juegos móviles: joystick de movimiento abajo a la izquierda y ataque abajo a la derecha.
- **Controles de la sacerdotisa y el mago** (2026-11-21): tienen un segundo botón, más pequeño, para su habilidad especial (oración, polimorfia); su botón de ataque solo hace el básico y no se carga. El espadachín y la arquera siguen cargando al mantener presionado.
- **Daño y vidas:** cada héroe tiene su propia barra de golpes. Al vaciarse, el héroe cae, el equipo pierde una **vida grupal** y el héroe reaparece tras unos segundos con la barra llena. Las heridas se mantienen de habitación en habitación; los cofres dan pociones.
- **Cofres** (diseñador, 2026-11-20): se abren al golpearlos (corte o disparo); pasar por encima no hace nada. Dan pociones al equipo (2026-11-21).
- **Final (v2):** ganan los héroes al derrotar al jefe. Gana el máster si el equipo se queda sin vidas grupales.
- Fuera de esta versión: subir de nivel, equipamiento, acertijos, pistas.

## Números

<!-- Del diseñador. Los marcados como propuesta los eligió el agente y se ajustan jugando. -->
- Vidas grupales del equipo: 3; 4 con cuatro héroes (diseñador, 2026-11-21).
- Golpes que aguanta un héroe: 4.
- Habitaciones del maestro: hasta 5, más la del jefe (diseñador, 2026-11-21).
- Tope de dificultad por habitación: 10 (diseñador dijo «10 o 6»; se empieza con 10), +5 por cada héroe después del primero (diseñador): 10, 15, 20, 25.
- Dificultad: enemigo +2 (diseñador), enemigo a distancia +3 (propuesta), ogro +5 (propuesta), suelo roto +4 (propuesta), paquete de pinchos +3 (propuesta), cofre −5 (diseñador). Cofres por sala según los héroes: 1, 2, 2 y 3 (diseñador, 2026-11-21).
- Pinchos (propuesta): 8 por sala, en dos grupos que se alternan: abajo 1,5 s, aviso 0,5 s, arriba 1 s.
- Ogro (propuesta): 10 de vida, lento, no daña al tocar; golpe de garrote anunciado con zona roja frente a él que quita 2 golpes; queda expuesto un momento tras golpear.
- Sacerdotisa (aprobado): maná 4, recupera 1 cada 1,5 s. Orbe de luz: 1 de maná, quita 1 a un enemigo o cura 1 golpe a un aliado. Oración: 3 de maná, cura 1 golpe a los aliados en 3,5 m.
- Mago (aprobado): maná 5, recupera 1 cada 1,2 s. Chispa: 1 de maná, quita 1 y quema 0,5 por segundo durante 2 s (la quemadura se reinicia, no se acumula, y no aturde). Polimorfia: 3 de maná, gallina durante 4 s; el jefe 1,5 s y después no puede volver a transformarse durante 8 s. Si la gallina no recibe daño dura un 50 % más (6 s; jefe 2,25 s); el primer daño, quemadura incluida, la deja en la duración corta contada desde que empezó (diseñador, 2026-11-21). La gallina no ataca, no daña al tocar, cancela el ataque que estaba anunciando y huye de los héroes.
- Poción (diseñador, 2026-11-21): cura 2 golpes, sin pasar de 4; el cofre da 1, o 2 con probabilidad del 20 %; sin máximo en el inventario.
- Invocar slime: espera de 30 s (propuesta). Cinemática del jefe: 4 s (propuesta).
- Reaparición tras caer: 1 s (diseñador).
- Aviso de ataque enemigo: 0,5 s (diseñador). Aturdimiento del enemigo golpeado: 0,25 s (propuesta).
- La habitación inicial trae 2 slimes de serie (propuesta).
- Carga del ataque potenciado: 0,6 s manteniendo presionado (propuesta). Vida del jefe: 30 golpes básicos (propuesta), +5 % por cada héroe extra (diseñador, 2026-11-21): 30; 31,5; 33; 34,5.

## Preguntas abiertas

<!-- Del diseñador. -->
- Balance del tope de dificultad según la fuerza de los héroes (el diseñador lo ajustará).
- Progresión de los héroes: recompensas, equipamiento y niveles.

## Decisiones del agente (v2, por confirmar jugando)

<!-- Del agente: huecos que la petición no cubría. -->
- La habitación inicial existe desde el principio y no cuenta entre las 5. El máster solo puede añadir habitaciones contiguas a una existente (arriba, izquierda o derecha); no puede editar una habitación donde ya entró un héroe.
- Una puerta entre dos habitaciones se abre cuando ambas están listas y al menos una ya no tiene enemigos. Así los héroes entran a pelear y pueden volver atrás por donde vinieron.
- Los enemigos solo actúan cuando hay un héroe en su habitación y no salen de ella.
- Un héroe caído reaparece junto a un compañero vivo, o en la habitación inicial si no queda ninguno.
- Cámara inclinada que sigue a cada héroe; el máster ve el mapa completo desde arriba y puede acercarse a una habitación para editarla.
- Maestro (2026-11-21): tocar en el mapa una sala con héroes (o ya jugada) la abre en Observar; una sin héroes, para construir. Al poseer, el slime ataca con una embestida corta (0,3 s al triple de velocidad, espera 0,9 s); el lanzador lanza, el ogro golpea con el garrote y el jefe salta hasta 4,5 casillas hacia donde apunta (Salto) o lanza el abanico (Orbes). Tocar el botón apunta solo al héroe más cercano; arrastrarlo apunta a mano. El enemigo poseído no retrocede al ser golpeado. El jefe no se puede soltar ni se invoca en su sala. La cinemática y el enemigo poseído llevan al maestro a esa sala.
- Apuntar como en los juegos de acción móviles: tocar el botón de ataque apunta solo al enemigo más cercano (a 9 casillas o menos, aunque esté fuera del alcance del ataque); arrastrarlo apunta a mano. Mientras se mantiene un botón, el suelo muestra el área del ataque: cono (corte), línea (disparos y hechizos) o círculo (giro del espadachín, oración).

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

## Plan actual (2026-11-21, validar al maestro)

1. [x] Servidor: 5 salas, pociones, introducción, posesión, invocación, jefe prediseñado con cinemática y controlado por el maestro (pruebas).
2. [x] Panel del maestro C (Mando del Maestro), vista Observar y controles de posesión.
3. [x] Arte de Codex (GPT-6.2-Astra, xhigh): maestro, enemigos poseídos, jefe verde, humo, círculo de invocación y efecto de poción.
4. [ ] Probarlo jugando con amigos (a 2 y a 3 jugadores).

## Plan anterior (2026-11-21, máster en dos partes)

1. [x] Formas de suelo, caídas, paquete de pinchos y cofres por cantidad (servidor y pruebas).
2. [x] Panel del máster con pestañas Sala y Enemigos.
3. [x] Arte de Codex (GPT-6.2-Astra): suelo roto con abismo y pinchos que suben y bajan.

## Plan anterior (2026-11-20, cuatro clases)

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

- 2026-11-21: el máster edita cada sala en dos pestañas que comparten el tope. **Sala:** forma del suelo (Entera, Orillas, Cruz, Puente; +4), paquete de 8 pinchos que se alternan (+3) y de 0 a 3 cofres en lugares fijos (−5 c/u). **Enemigos:** slime, lanzador y ogro tocando el suelo. Caer al vacío cuenta como héroe derrotado. Arte del suelo roto y de los pinchos por Codex (GPT-6.2-Astra, xhigh).

- 2026-11-21: barrita de vida y nombre sobre cada héroe hechos de nuevo (capa propia sobre el lienzo), para que se vean siempre; la cámara del máster encuadra la sala o el mapa en el espacio libre entre la barra de arriba y el panel, y el panel de la sala es más compacto (pestañas en la primera fila).

- 2026-11-21: botón especial de la sacerdotisa y el mago junto al de ataque (probado en pantallas de 360 a 412 px de ancho); «Maestro» en vez de «Máster»; sin coronas en los menús (banderín liso); textos de las tarjetas siempre dentro de la tarjeta. Espadachín rediseñado por Codex (GPT-6.2-Astra): sin casco, túnica y capa azules, armadura media y espada de acero, igual en el modelo y en la tarjeta; colores de la Arquera iguales a su tarjeta.

- 2026-11-21: jugable en escritorio (el foco sigue siendo el móvil). Con ratón y ventana apaisada el juego ocupa toda la ventana: menús en una columna centrada, panel del maestro centrado abajo y cámara del héroe que muestra más hacia los lados. Héroe: WASD o flechas para moverse, clic izquierdo ataca hacia el cursor (mantener carga), clic derecho es la habilidad especial; Espacio y E también sirven. Los botones táctiles siguen visibles y funcionan con el ratón.

- 2026-11-21: **el maestro dentro de la partida.** Los héroes empiezan leyendo una introducción mientras el maestro construye. Panel del maestro nuevo («Mando del Maestro»): el «+» construye al instante, enemigo elegido abajo a la izquierda con su lista al costado, terreno en un riel a la derecha, «Sala lista» grande abajo a la derecha. Vista Observar: tocar un enemigo lo posee (joystick y botón de ataque), «Invocar» pone un slime cada 30 s. La sala del jefe viene prediseñada: al entrar, cinemática del maestro poseyendo al jefe, que pasa de verde a morado, y el maestro lo controla (Salto y Orbes). Cofres con pociones compartidas que se usan solas (contador en la barra de arriba). 5 salas. Arte nuevo de Codex (GPT-6.2-Astra, xhigh).

Problemas conocidos:
- Los slimes son muy letales contra un héroe que no se mueve: en la prueba automática el héroe perdió 2 vidas en la primera sala. Para balancear jugando.
- Rendimiento en un teléfono real sin medir (Codex estimó ~1.500 triángulos y ≤8 llamadas de dibujo por personaje).
- El paquete del juego pesa ~1,2 MB (343 KB comprimido).
