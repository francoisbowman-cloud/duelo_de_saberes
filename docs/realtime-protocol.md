# Protocolo multijuego

## Selección

- `game:propose`: propone `trivia` o `riddles` y reinicia confirmaciones.
- `game:ready`: cambia la confirmación del jugador.
- `game:start`: comienza solo con dos jugadores conectados y todos listos.
- `game:return-to-lobby`: conserva sala y roster y elimina la partida activa.

## Acertijos

- `riddle:request-hint`: revela la siguiente pista y descuenta dos puntos.
- `riddle:submit-answer`: normaliza y valida la propuesta en el servidor.
- `riddle:state`: difunde la vista sincronizada. La solución solo existe durante revelación o resultados.

Todos los payloads se validan con Zod. `eventSequence` evita pistas y respuestas aplicadas a una ronda anterior.

## Palabra infiltrada

- `word:private-state`: palabra, categoría y dificultad visibles solo para su propietario.
- `word:submit-clue`: pista validada; rechaza revelar la palabra literalmente.
- `word:submit-vote`: decisión secreta `same` o `different`.
- `word:submit-guess`: adivinanza de la palabra contraria.
- `word:state`: pistas, fases, participantes que ya actuaron y revelación final.

## Rompecabezas compartido

- `puzzle:request-lock`: solicita control exclusivo durante cinco segundos renovables.
- `puzzle:move-piece`: sincroniza coordenadas normalizadas mientras se arrastra.
- `puzzle:release-piece`: libera la pieza y solicita encaje en una casilla.
- `puzzle:state`: estado público del tablero, piezas colocadas y controles activos.

El servidor valida la propiedad del bloqueo, la casilla correcta y la finalización. Los bloqueos se eliminan al desconectarse el jugador.

## Sala y audio

- `room:leave`: elimina la sesión del roster y libera recursos activos.
- `audio:status`: publica únicamente si el micrófono está activo o silenciado.
- `audio:signal`: retransmite ofertas, respuestas e ICE únicamente entre miembros de la misma sala.

El contenido de audio usa WebRTC P2P; el servidor no lo recibe, graba ni almacena.
