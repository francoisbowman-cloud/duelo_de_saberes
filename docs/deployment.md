# Despliegue

## Railway: backend

1. Crea un proyecto desde el repositorio GitHub.
2. Railway detectará `railway.json`: instala, compila y ejecuta `npm start`.
3. Configura `NODE_ENV=production`, `CLIENT_ORIGIN=https://TU-SITIO.netlify.app`, `SESSION_SECRET` (32 bytes aleatorios como mínimo) y `LOG_LEVEL=info`.
4. Agrega PostgreSQL y Redis; copia sus variables a `DATABASE_URL` y `REDIS_URL`. En este vertical slice todavía no son consumidas, pero quedan reservadas para la fase de persistencia.
5. Genera un dominio público y confirma que `https://DOMINIO/health` responde `{ "ok": true }`.

Despliegue actual: `https://duelo-api-production.up.railway.app`. El mismo servicio entrega `/` y `/socket.io`, por lo que es una versión jugable completa sin configuración adicional.

Railway proporciona `PORT`; no lo fijes manualmente. Mantén una sola réplica hasta incorporar Redis Adapter y locks distribuidos.

Para que los casos de Detectives sobrevivan reinicios durante una semana, monta un volumen Railway en `/data` y configura `DETECTIVE_STATE_FILE=/data/detective-rooms.json`. Sin volumen, el progreso dura mientras la instancia permanezca activa, pero no durante un redespliegue.

## Netlify: frontend

1. Importa el mismo repositorio.
2. `netlify.toml` publica `apps/web`, añade cabeceras y fallback.
3. Publica `apps/web`. El cliente acepta la URL del backend mediante `?server=https%3A%2F%2FTU-SERVICIO.up.railway.app`, la recuerda localmente y la conserva en los enlaces de invitación. Cuando frontend y backend comparten dominio, usa automáticamente el origen actual.
4. Actualiza `CLIENT_ORIGIN` en Railway con el dominio final exacto de Netlify.
5. Verifica HTTPS, creación de sala en un navegador e ingreso desde otro.

## Comprobación de humo

- `/health` responde 200.
- Dos navegadores ven el mismo roster.
- Solo el jugador activo puede responder.
- Cerrar la pestaña del creador no elimina la sala.
- Reabrir la pestaña restaura nombre, posición y puntaje.
