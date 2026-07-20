# Arquitectura de la fase inicial

## Estado encontrado

El repositorio original contenía solo `index.html` y `README.md`. En el HTML convivían estilos, 180 preguntas, validación de respuestas, marcador, temporizadores, PeerJS y audio WebRTC. El primer navegador era la autoridad; su cierre detenía la partida. Los invitados enviaban al anfitrión un booleano `correct`, por lo que el servidor no podía comprobar la respuesta.

## Decisión de migración

La fase 1 añade un servicio consolidado. Fastify atiende salud y futuros endpoints REST; Socket.IO mantiene presencia y comandos; `GameEngine` es la única autoridad. El frontend original se conserva para que la migración sea revisable. `apps/web` demuestra el flujo nuevo de extremo a extremo.

```text
Navegador / Netlify
  | comandos validados (sin respuestas correctas)
  v
Fastify + Socket.IO / Railway
  |-- GameEngine: salas, turnos, reloj, puntuación
  |-- Zod: límites y forma de mensajes
  |-- PostgreSQL: esquema preparado para contenido e historial
  `-- Redis: siguiente paso para snapshots y coordinación multi-instancia
```

## Fuente de verdad

El cliente nunca envía puntos ni el resultado de la validación. Envía `answer` y `eventSequence`. El servidor verifica membresía, fase, jugador activo, duplicidad, vigencia del reloj y respuesta correcta antes de modificar el marcador.

El tiempo se expresa como `deadlineAt`; el cliente solo calcula la representación visual. Un `setTimeout` del servidor realiza la transición por expiración.

## Reconexión

Al crear o ingresar se entrega un token aleatorio de 256 bits. El navegador lo guarda localmente y emite `room:rejoin` tras reconectar. El servidor enlaza el socket nuevo al jugador anterior y conserva posición y puntos. En la siguiente fase el token se firmará/rotará y el snapshot residirá en Redis con TTL.

## Dependencias y riesgos

- Las salas viven por ahora en la memoria de una sola instancia; un reinicio de Railway todavía las elimina.
- Redis y PostgreSQL tienen modelos/documentación, pero aún no están conectados al motor.
- El cliente nuevo contiene dos preguntas de prueba; falta importar y revisar editorialmente las 180 preguntas.
- El audio WebRTC permanece en el prototipo original; todavía no está integrado en `apps/web`.
- La rotación completa de múltiples preguntas y el cierre de partida son la siguiente entrega.
