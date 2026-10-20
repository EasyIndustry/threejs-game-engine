# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones
según [SemVer](https://semver.org): mientras sea `0.x`, una versión menor puede romper algo,
y si rompe queda dicho arriba de todo en esa entrada. Los pre-releases (`-rc.N`) se prueban
en una app antes del release (ver `CONTRIBUTING.md`).

## [0.1.0-rc.1] - 2026-10-20

Primera versión.

### Agregado

- **Loop de paso fijo** (`createLoop({ step, maxSteps, timeScale })`): `advance(dt)` corre los
  pasos fijos que entran (a lo sumo `maxSteps`, y descarta el resto: sin espiral de la muerte) y
  después `onUpdate(dt, alpha)` para interpolar lo que se dibuja. `pause`, `resume`, `timeScale`,
  `stepOnce` (cuadro a cuadro), `time`, `frame`, `dropped`. Determinista: 30, 60 o 144 cuadros
  por segundo dan el mismo resultado.
- **Entrada como acciones** (`createInput(bindings)`, `defineBindings`): botones y ejes
  (`axis2`) como datos, con los códigos de `KeyboardEvent.code`, `mouse:N` y el mapeo estándar
  del gamepad (`pad:a` … `pad:home`; `pad:left`, `pad:right` y `pad:dpad` como ejes).
  `pressed`, `justPressed`, `justReleased`, `value` (gatillos), `axis2` con zona muerta radial y
  diagonal normalizada. Los flancos se latchean hasta el primer paso fijo que los ve: un toque no
  se pierde en un cuadro sin pasos ni se cuenta dos veces en uno con dos. `rebind` sin flancos
  fantasma y `bindings()` serializable. `readGamepads` pasa lo del Gamepad API a datos planos.
- **Estados del juego** (`createStates`): una pila con `push`, `pop`, `replace`, `clear` y los
  ganchos `enter`, `exit`, `pause`, `resume`, `fixed`, `update`; solo corre el de arriba.
- **Entidades** (`createWorld`): objetos planos con `id`, consultas por componentes indexadas y
  armadas una vez (`query` devuelve un array que no cambia: se puede agregar y sacar mientras se
  recorre), nombres y etiquetas, sistemas por fase (`fixed`, `update`) y orden, `onAdd` y
  `onRemove`, y `toJSON` / `fromJSON` de los componentes que son datos (con `revive`).
- **Eventos** (`createEvents`): `on`, `once`, `off`, `emit`; un oyente que falla no corta a los
  demás.
- **Temporizadores** (`createTimers`): `after` y `every` con el tiempo del juego, cancelables y
  deterministas.
- **Cámara de juego, pura** (`followCamera`): sigue a un objetivo (posición y rumbo) y devuelve
  `{ position, target }` para `view.set()` de threejs-render-engine. Modos `behind` (tercera
  persona), `top` (cenital fija) y `side` (2.5D); `lookAhead`; amortiguación crítica exacta
  (`damp`, `dampAngle`: igual a cualquier framerate), por eje si hace falta; `collide` de la app.
- **Transform** (`checkTransform`, `blendTransform`, `lerpAngle`): `position`, `rotation`, `scale`
  planos y su interpolación entre dos pasos.
- **Adaptador** (`createGame({ engine, step, bindings, target, gamepad })` en
  `threejs-game-engine/three`): se engancha a `engine.onFrame` de un motor ya creado, lee el
  teclado (sin repetición, ignorando los campos de texto), el mouse y el gamepad, suelta todo al
  perder el foco y reclama (`view.claim`) los gestos de los botones del mouse del juego. Una
  entidad con `object3d` (un Object3D o algo con `.object`: un sprite, un emisor) y `transform` se
  cuelga sola en `engine.content` y se dibuja interpolada; un `facing` (sprite) recibe la guiñada.
  `game.camera.follow(…)` toma la cámara con `view.suspend('game')` y `release()` la devuelve;
  `collide: true` choca con `engine.content` (salvo `userData.noCollide`). `snap`, `stats`,
  `pause`, `resume`, `dispose` y `help()` en cada objeto.
- Pruebas en Node (`node --test`) y tipos estrictos con JSDoc (`npm run typecheck`).
- `examples/index.html`: un juego chiquito (caminar, saltar, juntar monedas, menú, pausa, tres
  cámaras) sobre three con OrbitControls.
