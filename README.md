# DUELO DE SABERES — trivia multijugador a distancia

Trivia competitiva en vivo, por rondas de 20 preguntas, con audio en tiempo real, para hasta 4 personas que no están en el mismo lugar. Un archivo HTML autocontenido: sin backend propio, sin cuentas ni base de datos.

## Qué incluye

- **180 preguntas** en 9 categorías (Historia, Ciencia, Geografía, Arte y Literatura, Cultura Pop, Deportes, Naturaleza, Tecnología y **Actualidad**), sin repetirse hasta agotar todo el banco de la categoría elegida. La categoría "Actualidad" cubre eventos verificados de 2025-2026 (Champions League, Serie Mundial, Nobel, Óscars, misiones espaciales).
- **Nombre de jugador obligatorio** y salas de **hasta 4 personas**.
- **Rondas de 20 preguntas.** Al completar las 20, aparece una pantalla de transición animada con el resumen (marcador de todos) antes de arrancar la ronda siguiente.
- **Mecánica de turnos con robo:** a cada pregunta le toca responder a un jugador distinto (rotación automática). Tiene **30 segundos**. Si falla o se acaba el tiempo, el turno pasa al siguiente jugador conectado, que tiene **10 segundos** para intentarlo — quien ya falló espera a la siguiente pregunta. Si alguien acierta, se lleva el punto y se revela la respuesta.
- El cronómetro de 30 segundos es un límite real: si nadie responde a tiempo, se fuerza el avance a la siguiente pregunta.
- Tras revelar la respuesta (correcta o no), el **dato curioso queda visible varios segundos** (no unos pocos) para que dé tiempo a leerlo con calma antes de pasar sola a la siguiente pregunta.
- Las preguntas salen en **orden verdaderamente aleatorio** en cada partida (no una secuencia fija), y no se repiten hasta agotar el banco de la categoría.
- Dos modalidades de pregunta: opción múltiple y **escribe la palabra** (sin importar mayúsculas ni acentos).
- Marcador grupal en vivo con el nombre de cada jugador, racha personal, medallas de conocimiento y confeti.
- Indicador de **presencia en línea**, **roster de jugadores conectados** y **audio en vivo en grupo** (llamada de voz entre todos los conectados) con un clic.

## Cómo funciona (sin servidor propio)

El juego usa [PeerJS](https://peerjs.com/) para abrir conexiones **WebRTC** directas entre navegadores, señalizadas a través de un servidor de **WebSocket público y gratuito** que PeerJS ya provee (no hay que crear cuenta ni desplegar nada propio).

La arquitectura es **anfitrión-autoritativo**: la primera persona en entrar a una sala se convierte automáticamente en el **anfitrión**, quien es la única fuente de verdad sobre la pregunta actual, el orden de turnos, los cronómetros y el marcador de todos. El resto entra como invitados y se conecta directamente al anfitrión. El audio, en cambio, es de malla completa: cada participante llama directamente a los demás, para que la conversación de voz sea entre todos.

**Importante:** si el anfitrión se desconecta o cierra la pestaña, la partida se detiene — hay que volver a entrar a la sala (la persona que entre primero será el nuevo anfitrión).

Por eso "subir a un servidor" aquí sigue significando únicamente **alojar un archivo estático** — cualquier hosting gratuito con HTTPS sirve. El HTTPS es obligatorio para que el navegador permita usar el micrófono.

## Cómo publicarlo (elige uno, 2-3 minutos)

**Netlify (arrastrar y soltar)** — https://app.netlify.com/drop, arrastra `index.html`, listo.
**GitHub Pages** — sube `index.html` a un repo y activa Pages en Settings.
**Vercel** — importa el repo de GitHub en https://vercel.com/new.

Nota: si abren el archivo directo por doble clic (`file://`), la trivia visual funciona igual, pero la conexión entre jugadores y el micrófono no funcionarán porque los navegadores exigen HTTPS (o `localhost`) para dar acceso a audio y, en algunos casos, a WebRTC.

## Cómo se juega

1. Cada persona (hasta 4) escribe su **nombre**, entra con el **mismo código de sala** y marca las **mismas categorías**.
2. La primera persona en entrar es el anfitrión; el resto se une automáticamente al verlo en el roster.
3. En cada pregunta le toca a un jugador distinto. Tiene 30 segundos. Si falla o se acaba el tiempo, el turno "salta" al siguiente jugador conectado con 10 segundos, y así sucesivamente — quien ya respondió mal en esa pregunta no puede volver a intentarlo.
4. Al acertar alguien, o si nadie acierta, se revela la respuesta correcta junto con el dato curioso, visible varios segundos antes de continuar sola a la siguiente pregunta.
5. Cada 20 preguntas aparece la pantalla de cierre de ronda con el marcador de todos, antes de continuar con la ronda siguiente.
6. Cualquiera puede pulsar **"Activar audio en vivo"** para hablar por voz con todo el grupo.

### Si el audio no conecta
Depende de que los navegadores se comuniquen a través del servicio público de señalización; algunas redes bloquean este tráfico. Si eso pasa, la trivia sigue funcionando normalmente, solo sigan hablando por su medio habitual.

### Modo asíncrono
**"Compartir sala"** genera un enlace con el mismo código y categorías, para enviar por chat.

### Modo individual
Si por alguna razón la conexión en vivo entre navegadores no está disponible, el juego sigue siendo jugable en solitario (sin turnos entre otras personas).

## Personalizar contenido

Todo vive dentro de `index.html`:
- `CATEGORY_DEFS`: las categorías disponibles.
- `TRIVIA`: las preguntas. Cada una tiene `type: "mcq"` (con `opts` y `correct`) o `type: "word"` (con `answer` y, opcionalmente, `accepts`), más un `fact`.
- `BADGES`: los umbrales de puntaje para las medallas.
- `QUESTIONS_PER_ROUND` (20), `TIMER_MAIN` (30s), `TIMER_STEAL` (10s), `FACT_DISPLAY_MS` (tiempo de lectura del dato curioso) y `MAX_PLAYERS` (4): ajustables al inicio del script.

No requiere build ni dependencias propias — solo carga PeerJS desde su CDN público para el estado de partida, la presencia y el audio.
