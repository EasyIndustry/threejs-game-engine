## Qué cambia y por qué

<!-- Qué problema resuelve, para qué tipo de juegos. -->

Cierra #

## Política

- [ ] Viene de un issue `aceptado` (o es un error).
- [ ] Es una herramienta general, no la regla de un juego ([POLITICA.md](../POLITICA.md)).
- [ ] Si alcanzaba con un punto de extensión (bindings, un gancho de estado, un sistema, un evento, una opción), es eso y no una función nueva.

## Contrato

- [ ] Lo puro (`src/`) no importa three ni el DOM, y tiene su prueba en `test/`.
- [ ] Ningún motor de la suite se importa: se usa por su forma (`onFrame`, `view`, `content`, `.object`).
- [ ] Lo que corre en el paso fijo sigue siendo determinista (igual a cualquier framerate), con su prueba.
- [ ] Una definición nueva se valida con errores que dicen dónde, y una clave desconocida es un error.
- [ ] Cada miembro nuevo de la API tiene su línea en la tabla de `src/members.js` de su objeto.
- [ ] Ninguna dependencia nueva, o se carga a pedido y está justificada en el issue.
- [ ] Lo que andaba sigue andando, o va en el `CHANGELOG.md` como **Ruptura** con cómo migrar.
- [ ] `npm test` y `npm run typecheck` pasan, y lo que dibuja está probado a ojo en `examples/index.html`.
