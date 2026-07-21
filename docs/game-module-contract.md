# Contrato de minijuegos

La sala es persistente y el juego activo es reemplazable. `RoomState` conserva código, roster, selección y jugadores listos; `game` o `riddleGame` contienen exclusivamente el estado de la sesión activa.

El registro admite `trivia`, `riddles`, `word-infiltrator` y `shared-puzzle`. Cada modo declara un identificador estable y mantiene toda validación en el servidor. Palabra infiltrada usa una vista privada por jugador; el rompecabezas usa bloqueos temporales autoritativos para impedir el control simultáneo de una pieza.

Reglas obligatorias:

- Las soluciones y asignaciones secretas nunca se envían antes de la revelación.
- Toda acción incluye sala y secuencia de evento para rechazar mensajes atrasados.
- Terminar un juego no elimina la sala; `game:return-to-lobby` limpia solo la sesión activa.
- El contenido se vuelve a mezclar al comenzar cada partida y evita repetir inmediatamente el primer elemento anterior.
- El audio, cuando se reactive, pertenecerá a la sala y no al módulo.
