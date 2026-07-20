# Protocolo Socket.IO v0.1

Todos los payloads cliente-servidor se validan con Zod en `packages/shared/src/index.ts`. Las confirmaciones usan `{ ok: true, data }` o `{ ok: false, error: { code, message } }`.

## Cliente a servidor

| Evento | Payload | Efecto |
|---|---|---|
| `room:create` | `{ displayName }` | Crea sala y sesión |
| `room:join` | `{ code, displayName }` | Ingresa al lobby |
| `room:rejoin` | `{ code, sessionToken }` | Recupera jugador y marcador |
| `game:start` | `{ code }` | Inicia la primera pregunta |
| `game:submit-answer` | `{ code, answer, eventSequence }` | Valida respuesta y turno |
| `ping` | `{ sentAt }` | Mide desfase con el servidor |

## Servidor a cliente

| Evento | Contenido |
|---|---|
| `room:state` | Sala, roster y estado público completo |
| `game:question` | Pregunta sin respuesta correcta |
| `game:reveal` | Resultado, respuesta y dato curioso |
| `session:replaced` | Una pestaña más reciente tomó la sesión |
| `error` | Error seguro y tipado |

`eventSequence` hace obsoletos los envíos pertenecientes a un turno anterior. `maxHttpBufferSize` limita cada mensaje a 16 KB.

## Errores esperados

`INVALID_PAYLOAD`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `GAME_ALREADY_STARTED`, `INVALID_SESSION`, `UNAUTHORIZED`, `INVALID_PHASE`, `NOT_YOUR_TURN`, `DUPLICATE_ANSWER`, `STALE_EVENT`, `TIME_EXPIRED`.
