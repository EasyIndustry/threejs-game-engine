# Política del repositorio

Este repo es un **módulo vendorizable** y **open source** (MIT): varias apps lo copian tal cual
y cualquiera puede usarlo, pedir cambios o contribuir. Esta política dice qué entra y cómo se
decide. Vale igual para un pedido de afuera y para uno de una app de casa: el que pide no
cambia la respuesta.

Todo es común a los módulos vendorizables salvo la última sección, **En este repo**, que es lo
único que cambia de un repo a otro.

## El principio

**No hacemos cambios con una utilidad específica: hacemos una herramienta específica para un
abanico de posibilidades.**

Un pedido nace casi siempre de una app concreta, y está bien que sea así. Pero lo que entra al
módulo no es la solución de esa app sino la herramienta que resuelve esa clase de problema para
cualquier app. Si no se puede generalizar, queda en la app.

## El filtro

Cada pedido (issue o PR) pasa por estas preguntas, en orden. La primera que corta decide.

1. **¿Qué problema resuelve?** El pedido se lee por la necesidad, no por la solución que trae.
   "Quiero un botón de vista frontal para mis placas" es, de fondo, "vistas con nombre y
   encuadre".
2. **¿Ya se puede?** Si la app lo resuelve con la API que hay, con un preset o con un punto de
   extensión, no hace falta cambiar el módulo: se responde con el cómo.
3. **¿A quién más le sirve?** Tiene que servirle al menos a dos tipos de app distintos, no a dos
   pantallas de la misma. Si el único caso es el de quien lo pide, no entra tal cual.
4. **¿Se puede generalizar?** Si la necesidad de fondo es general aunque el pedido no lo sea, se
   reescribe como herramienta general y entra así.
5. **¿Respeta el contrato del repo?** El de **En este repo**: forma de la API, módulos puros,
   dependencias, compatibilidad.

Ante la duda, se prefiere **un punto de extensión a una función nueva**: una marca que el módulo
respeta, una opción, un aviso (`on…`), un preset. Le deja a la app hacer lo suyo sin que lo suyo
entre al módulo.

## Qué puede pasar con un pedido

Cada pedido nuevo entra con la etiqueta `triage` y sale con una de estas:

| Etiqueta | Qué quiere decir | Qué pasa |
|---|---|---|
| `aceptado` | pasa el filtro tal cual | queda abierto hasta que se implementa |
| `generalizar` | la necesidad sirve, el pedido es muy puntual | se reescribe en el issue como herramienta general; con eso pasa a `aceptado` |
| `sin-cambios` | ya se puede con lo que hay | se cierra con el cómo (API, preset o extensión) |
| `fuera-de-alcance` | es de la app, no del módulo | se cierra con por qué y dónde resolverlo |

Ningún pedido se cierra sin una explicación. Un "no" dice siempre por qué y qué hacer en cambio.

Aparte, `error` marca lo que el módulo promete y no cumple. Un error no pasa por el filtro, salvo
que sea un pedido disfrazado: si "no anda" quiere decir "no hace lo que mi app necesita", es un
pedido.

Las etiquetas están en `.github/labels.json` y se crean solas en GitHub (`.github/workflows/labels.yml`).

## Vendorizar

- Se copia el módulo **tal cual**, en una versión publicada.
- **La copia no se edita.** Si una app necesita un cambio, vuelve acá como issue y pasa por el
  filtro. Una copia con parches propios deja de poder actualizarse.
- Lo que la app agrega va en la app, usando la API y los puntos de extensión.

## Versiones y compatibilidad

- [Semver](https://semver.org/lang/es/). Mientras sea 0.x, una versión menor puede romper; un
  parche nunca.
- Toda ruptura va en el `CHANGELOG.md` marcada **Ruptura**, con qué cambia y cómo migrar.
- Cuando se puede, lo viejo sigue andando una versión más, con un aviso en la consola.

## Dependencias

- Ninguna dependencia propia sin justificarla en el issue: cada una es una dependencia más para
  cada app que vendoriza el módulo.
- Las pesadas se cargan a pedido, para que una app que no las usa no las necesite.

## Open source

- Licencia MIT ([`LICENSE`](LICENSE)). Lo que se contribuye entra bajo la misma licencia.
- Convivencia: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Problemas de seguridad: [`SECURITY.md`](SECURITY.md), en privado.
- Cómo se contribuye: [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Idioma:** el repo está en castellano (código, documentación, issues). Un issue en otro idioma
  se acepta y se responde.

## En este repo

**threejs-game-engine:** lo que hace falta para un juego en three.js, sin tocar three.

**La pregunta:** ¿le sirve a cualquier juego hecho con three.js, sea de plataformas, de vista
cenital o en tercera persona?

- **Entra:** el tiempo del juego (el loop de paso fijo, la pausa, la cámara lenta, los
  temporizadores), la entrada como acciones (teclado, mouse, gamepad, cambiar los controles),
  los estados del juego (menú, nivel, pausa), las entidades y los sistemas, los eventos entre
  sistemas, la cámara de juego (seguir, suavizar, chocar) y lo que hace falta para orquestar a
  los otros motores de la suite: dibujar una entidad (`object3d` + `transform`) y guardar la
  partida como datos.
- **No entra:** las reglas de un juego (qué es una vida, cuánto salta un personaje, qué da una
  moneda), sus controles por defecto, sus textos ni sus menús: eso lo pone la app con la API.
  Tampoco cómo se ve la escena (es de threejs-render-engine), los materiales (de
  threejs-material-engine), los sprites (de threejs-sprite-engine) ni las partículas (de
  threejs-particle-engine). **Este motor no importa ninguno**: los recibe ya creados y los
  maneja por su forma (`engine.onFrame`, `engine.view`, `engine.content`, algo con `.object`).
- **Una regla de un juego es código de la app**, no un default: una gravedad, una velocidad o un
  mapa de teclas que solo tiene sentido para un juego va en ese juego.
- **Lo pesado se carga a pedido**: una física (Rapier), el audio o la red entran, si entran, como
  adaptadores aparte que una app que no los usa no necesita.
- **Puntos de extensión que ya hay:** `bindings` y `rebind` (los controles como datos), los
  ganchos de un estado (`enter`, `exit`, `pause`, `resume`, `fixed`, `update`), `world.system`,
  `world.onAdd` / `onRemove`, `events`, `game.loop.onFixed` / `onUpdate`, las opciones de
  `followCamera` (y `collide`, una función de la app), la marca `userData.noCollide` y el
  `revive` de `fromJSON`.
- **El contrato** (el técnico, con sus pruebas) está en [`CONTRIBUTING.md`](CONTRIBUTING.md).
