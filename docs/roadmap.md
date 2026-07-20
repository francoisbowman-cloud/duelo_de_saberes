# Roadmap y límites reales

## Fase 1A - entregada en esta rama

Contratos tipados, sala de cuatro personas, roster, primera pregunta, turno, robo, reloj, validación, puntuación, desconexión sin anfitrión y reconexión básica.

## Fase 1B - siguiente

- importar las 180 preguntas a migraciones/seed y revisar fuentes;
- rotar preguntas, cerrar revelación, ronda y partida;
- snapshots de sala y TTL en Redis;
- Socket.IO Redis Adapter y locks de temporizador;
- integrar audio PeerJS separado del estado;
- protección de pestañas duplicadas;
- pruebas restantes de avance, finalización, expiración y recuperación tras reinicio.

## Fase 2

Persistir partidas y respuestas en PostgreSQL; editor con flujo `draft -> review -> approved`; perfiles opcionales después de jugar.

## Fase 3

Presentador por reglas, tensión 0-100 y una ronda especial extensible. Después: espectadores, rivalidades y grupos.

## Fuera de alcance actual

Temporadas, torneos, rankings globales, poderes, autenticación social, IA en tiempo real, SFU de audio y analítica avanzada.
