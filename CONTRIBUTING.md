# Contribuir

Este motor se vendoriza en varias apps. La pregunta antes de cada cambio no es "¿le sirve al
juego que lo pidió?" sino "¿le sirve a cualquier juego hecho con three.js?".

**Primero, [`POLITICA.md`](POLITICA.md):** qué entra, cómo se evalúa un pedido y qué puede pasar
con él. Un pedido de una app de casa pasa por el mismo filtro que uno de afuera.

## Cómo se pide algo

- **Un pedido:** un issue con la plantilla *Pedido*. Contá el problema, no solo la solución, y a
  qué otro tipo de juego le serviría.
- **Un error:** un issue con la plantilla *Error*, con cómo reproducirlo.
- **Un PR:** mejor después de un issue `aceptado`, para no hacer trabajo que no va a entrar. La
  plantilla del PR trae el checklist del contrato.

## El contrato

1. **Lo puro no importa three ni el DOM** (`src/`): el loop, la entrada, los estados, las
   entidades, los eventos, los temporizadores y la cámara corren en Node, y una prueba lo frena
   si pasa. three y el DOM (teclado, mouse, Gamepad API) van en `adapters/three/`, que no decide
   nada: le pasa valores planos al núcleo.
2. **Ningún motor importa a otro motor de la suite.** El juego recibe los otros motores ya
   creados y los usa por su forma (`engine.onFrame`, `engine.view.set`, `engine.view.suspend`,
   `engine.view.claim`, `engine.content`, algo con `.object`). Una prueba lo frena si pasa.
3. **Determinista.** Lo que corre en el paso fijo da lo mismo a 30, 60 o 144 cuadros por
   segundo, y los temporizadores dan lo mismo con un dt grande que con varios chicos. Lo nuevo que
   toca el tiempo trae su prueba de eso.
4. **Las definiciones son datos, validados**: los controles (`defineBindings`), las opciones de
   la cámara (`defineFollow`), el `transform`. Un error dice dónde (`mover.keys.arriba`), y una
   clave que no existe es un error, no un valor que se ignora.
5. **Cada miembro de la API tiene su línea en `src/members.js`**, una tabla por objeto. Las
   pruebas leen el fuente y exigen que cada tabla de `help()` y la API de su objeto coincidan, en
   las dos direcciones.
6. **Sin dependencias** de ejecución: three es *peer* (opcional, solo para el adaptador) y
   `typescript` es lo único de desarrollo, para `npm run typecheck`.

## Cómo se agrega algo

1. En `src/` (lo puro), con su prueba en `test/`, en Node.
2. Con su línea en la tabla de `src/members.js` del objeto que lo tiene.
3. Si toca three o el DOM, en `adapters/three/game.js`, probado a ojo en `examples/index.html`.
4. En el `CHANGELOG.md`, y si rompe algo, marcado **Ruptura** con cómo migrar.

El tipado se verifica con `npm run typecheck`, en modo estricto. Los tipos van en JSDoc: los
archivos siguen siendo `.js` y no hay paso de build. Cubre `src/`; el adaptador queda afuera
(pediría los tipos de three).

## Compatibilidad hacia atrás (mientras sea 0.x)

- La API puede cambiar entre versiones menores. Lo que cuenta como **cambio que rompe algo**:
  - cambiar o quitar la firma de un método o propiedad pública;
  - cambiar un valor por defecto que afecta el resultado (el paso fijo, la zona muerta, los
    offsets de los modos de la cámara);
  - cambiar el orden de lo que corre en un cuadro o en un paso;
  - quitar o renombrar una entrada de `help()`;
  - cambiar el formato de `bindings()` o de `world.toJSON()` sin una migración.
- Lo que **no** cuenta como ruptura: agregar un método, agregar una opción, mejorar el rendimiento
  sin cambiar el resultado.
- Todo cambio que rompa algo queda **dicho arriba de todo** en la entrada de ese release en
  `CHANGELOG.md`.

## Ramas, pre-releases y releases

**Hasta la 1.0, todo pasa por `test`.** `main` solo se actualiza para la 1.0 (y para la política del
repo y lo que no es código); mientras tanto no hay PR de `test` a `main` ni release sin `-rc`.

- **`test`** es la rama de trabajo y de lo que se prueba en una app. El trabajo se hace en ramas
  propias y se mergea a `test` (con merge commit, nunca squash: los tags tienen que seguir
  apuntando a commits de `test`).
- **Pre-release `vX.Y.Z-rc.N`** sobre un commit de `test`: es lo que una app vendoriza. Cada issue
  que entra suma un rc (`-rc.2`, `-rc.3`…), o abre la versión siguiente (`0.2.0-rc.1`).
- **La serie arranca en `0.1.0-rc.1`.**
- **1.0:** recién ahí `test` pasa a `main` (PR con merge commit), con su commit de release y
  `gh release create v1.0.0`.

### Publicar un pre-release

1. `package.json` dice la versión del rc (`0.1.0-rc.1`) y `CHANGELOG.md` tiene su entrada (lo que
   rompe, arriba de todo). Una prueba exige que la versión tenga su entrada.
2. `test` apunta a ese commit.
3. ```bash
   gh release create v0.1.0-rc.1 --prerelease --target <sha completo> --title v0.1.0-rc.1 --notes-file <notas>
   ```
   `--target` necesita el SHA de 40 caracteres: con uno abreviado, GitHub contesta
   "target_commitish is invalid".
