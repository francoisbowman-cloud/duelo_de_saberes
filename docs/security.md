# Notas de seguridad

Implementado en esta fase:

- validación Zod en todos los eventos entrantes;
- códigos de sala generados con criptografía, no listas predecibles;
- tokens de sesión de 256 bits;
- autorización por membresía y turno;
- control de fase, expiración y `eventSequence`;
- límite de mensajes de 16 KB;
- rate limiting HTTP, CORS restringible, Helmet y body limit;
- sanitización y escape de nombres;
- respuestas correctas excluidas de `game:question`;
- mensajes de error sin stack ni secretos.

Pendiente antes de producción pública:

- hash o firma y rotación de tokens de sesión;
- rate limiting específico por evento/socket e IP;
- protección explícita contra pestaña duplicada mediante versión de sesión;
- Redis locks y Socket.IO Redis Adapter para más de una réplica;
- registros estructurados con redacción;
- CSP estricta sin CDN, sirviendo Socket.IO localmente;
- revisión editorial y de fuentes del banco importado;
- pruebas de abuso, carga y reconexión caótica.

No se guarda ni retransmite audio por el backend.
