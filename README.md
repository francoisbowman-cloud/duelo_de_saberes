# Duelo de Saberes

Arena social de trivia multijugador en español. Esta rama inicia la migración progresiva desde el prototipo PeerJS con anfitrión hacia un backend autoritativo en Railway y un frontend estático en Netlify.

## Jugar ahora

La versión desplegada está disponible en:

**https://duelo-api-production.up.railway.app/**

Railway sirve temporalmente el frontend y el backend en el mismo dominio. Esto permite jugar de inmediato mientras se completa la conexión independiente de Netlify.

## Estado de la fase 1

El vertical slice actual permite:

- crear una sala con código aleatorio de seis caracteres;
- ingresar hasta cuatro jugadores;
- ver el roster y el marcador en vivo;
- iniciar una partida sin que un navegador se convierta en anfitrión;
- jugar una partida completa de diez preguntas aleatorias sin recibir respuestas correctas antes de tiempo;
- validar turno, tiempo y respuesta exclusivamente en el servidor;
- sumar puntos y activar un robo de turno;
- reconectar con un token persistente;
- continuar con la sala aunque se desconecte quien la creó;
- avanzar automáticamente entre pregunta, robo, revelación y marcador final;
- desplegar `apps/web` en Netlify y el servicio Node.js en Railway.

El prototipo original se conserva en [`index.html`](./index.html) como referencia funcional y para migrar el audio WebRTC en la siguiente iteración. La nueva experiencia está en [`apps/web`](./apps/web) y también es servida por el backend.

## Inicio local

Requisitos: Node.js 20 o superior.

```bash
npm install
copy .env.example .env
npm run dev
```

Sirve el frontend en otro terminal:

```bash
npx serve apps/web -l 8080
```

Abre `http://localhost:8080`. El cliente usa `http://localhost:3000` automáticamente cuando se ejecuta en localhost.

## Comandos

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Estructura

```text
apps/web          Frontend estático para Netlify
apps/server       Fastify, Socket.IO y motor autoritativo
packages/shared   Tipos, esquemas Zod y protocolo compartido
docs              Arquitectura, protocolo, despliegue y roadmap
migrations        Modelo PostgreSQL inicial
index.html        Prototipo PeerJS original, sin modificar
```

## Documentación

- [Arquitectura](./docs/architecture.md)
- [Protocolo Socket.IO](./docs/socket-protocol.md)
- [Despliegue](./docs/deployment.md)
- [Seguridad](./docs/security.md)
- [Roadmap y limitaciones](./docs/roadmap.md)

## Variables

Consulta [`.env.example`](./.env.example). Nunca publiques `SESSION_SECRET`, `DATABASE_URL` ni `REDIS_URL` en Netlify o en el código cliente.
