# threejs-game-engine

Lo que hace falta para un juego en [three.js](https://threejs.org), sin tocar three: el loop de
paso fijo, la entrada como acciones, los estados del juego, las entidades y la cámara de juego.
**Orquesta** a los otros motores de la suite (render, sprites, partículas) pero no importa
ninguno: los recibe ya creados.

```js
import { createEngine } from 'threejs-render-engine';
import { createGame } from 'threejs-game-engine/three';

const motor = createEngine(document.body, { preset: 'warm', area: 30 });
const juego = createGame({
  engine: motor,                                       // cualquier objeto con onFrame(fn) y view.set(estado)
  bindings: {
    saltar: ['Space', 'pad:a'],
    disparar: ['mouse:0', 'pad:rt'],
    mover: { type: 'axis2', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, pad: 'pad:left' },
  },
});

const heroe = juego.world.add({
  name: 'heroe', object3d: malla,                      // se cuelga sola en motor.content
  transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
  velocity: [0, 0, 0],
});

juego.world.system('mover', (dt) => {                  // a 60 Hz fijos, en cualquier pantalla
  const [x, y] = juego.input.axis2('mover');
  heroe.transform.position[0] += x * 6 * dt;
  heroe.transform.position[2] -= y * 6 * dt;
  if (juego.input.justPressed('saltar')) juego.events.emit('salto', heroe);
});

juego.camera.follow(heroe, { mode: 'top', damping: 0.12, lookAhead: 1.5 });
juego.states.push(nivel);                              // { enter, exit, pause, resume, fixed, update }
juego.timers.every(2, () => aparecerMoneda());
juego.start();
juego.help();                                          // todo lo que hay (y juego.world.help(), juego.input.help()…)
```

- **Paso fijo.** La lógica corre a un ritmo fijo (1/60 por defecto) aunque la pantalla dibuje a
  30 o a 144: la física da lo mismo en cualquier máquina. Con un cuadro lento corre a lo sumo
  `maxSteps` pasos y descarta el resto (sin espiral de la muerte); lo que se dibuja se
  interpola con `alpha`. `timeScale` (cámara lenta), `pause`, y `stepOnce()` para depurar cuadro
  a cuadro.
- **La entrada como acciones.** El juego pregunta por "saltar", no por la barra espaciadora. Los
  controles son datos (`bindings()` se guarda y se vuelve a cargar; `rebind` para el menú de
  controles), con los códigos de `KeyboardEvent.code` (la tecla física: WASD queda en su lugar
  en un teclado AZERTY), `mouse:0` … `mouse:4` y el mapeo estándar del gamepad (`pad:a`,
  `pad:rt`, `pad:start`, `pad:up`…; `pad:left` y `pad:right` como sticks, `pad:dpad` como cruz).
  Ejes con zona muerta radial y la diagonal del teclado normalizada; `value()` para un gatillo.
  **`justPressed` no se pierde ni se cuenta dos veces** aunque un cuadro corra 0 o 2 pasos
  fijos: el flanco queda latcheado hasta que termina el primer paso que lo vio (y afuera de un
  paso, en un menú que corre por cuadro, vale el del cuadro). Al perder el foco se suelta todo:
  no queda una tecla trabada.
- **Estados del juego**: una pila (`push`, `pop`, `replace`). Solo corre el de arriba: la pausa
  encima del nivel lo deja en pausa (`pause` / `resume`) hasta que se va.
- **Entidades, sin dogma de ECS**: objetos planos con sus componentes. `query('transform',
  'velocity')` es rápida (índices por componente, la consulta queda armada) y segura (se puede
  agregar y sacar mientras se recorre). Nombres, etiquetas, sistemas por fase y orden, y
  `toJSON()` / `fromJSON()` de lo que es datos, para guardar la partida.
- **Eventos** para que los sistemas se avisen sin conocerse ("murió", "agarró la moneda") y
  **temporizadores** con el tiempo del juego (la pausa y la cámara lenta los frenan).
- **Cámara de juego**: `game.camera.follow(entidad, { mode })` con tres modos — `behind`
  (tercera persona), `top` (cenital fija, ideal para pixel art), `side` (plataformas 2.5D) —,
  `lookAhead`, amortiguación crítica (llega sin pasarse, igual a cualquier framerate), por eje si
  hace falta, y `collide: true` para no atravesar paredes. Mientras la cámara es del juego, la
  órbita del motor queda bloqueada (`view.suspend`); `release()` la devuelve.
- **Sin build.** Módulos ES. **Núcleo puro**: `src/` no importa three ni el DOM y corre en Node.
  Sin dependencias: three es *peer*, solo para el adaptador.

## Estructura

```
src/
  loop.js         createLoop: el paso fijo, alpha, pausa, cámara lenta, cuadro a cuadro (puro)
  input.js        createInput, defineBindings, readGamepads: la entrada como acciones (puro)
  states.js       createStates: la pila de estados del juego (puro)
  world.js        createWorld: entidades, consultas, sistemas, toJSON / fromJSON (puro)
  events.js       createEvents: el bus de eventos (puro)
  timers.js       createTimers: after / every con el tiempo del juego (puro)
  camera.js       followCamera, damp: la cámara de juego como valores planos (puro)
  transform.js    el transform plano y su interpolación (puro)
  help.js         help(): la ayuda de la API
  members.js      las tablas de help(), una por objeto (puras: las pruebas las comparan con la API)
adapters/three/
  game.js         createGame: el loop sobre engine.onFrame, el teclado, el mouse, el gamepad,
                  object3d + transform, la cámara con view.set / suspend / claim
examples/         un juego chiquito para probarlo a ojo
test/             las pruebas, en Node
```

## Usarlo, sin build

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
</script>
<script type="module">
  import { createGame } from './vendor/threejs-game-engine/adapters/three/game.js';
  // lo puro, sin three: import { createLoop, createWorld } from './vendor/threejs-game-engine/src/index.js';
</script>
```

Probado con three 0.170.0 (pide `>=0.160.0`).

## Qué corre en cada cuadro

`createGame` se engancha a `engine.onFrame` (con `start()`) y en cada cuadro:

1. lee los gamepads (Gamepad API) y se los pasa a la entrada;
2. `loop.advance(dt)`: en cada paso fijo — guarda el transform anterior de cada entidad →
   `states.fixed` → `world.fixed` (los sistemas `phase: 'fixed'`) → `timers.update` → lo que la app
   agregó con `game.loop.onFixed`;
3. una vez — `states.update` → `world.update` (los sistemas `phase: 'update'`) → copia cada
   `transform` a su `object3d`, interpolado con `alpha` → la cámara (`view.set`) → lo que la app
   agregó con `game.loop.onUpdate`;
4. cierra los flancos de la entrada del cuadro.

La entrada se lee en los estados, en los sistemas o en `game.loop.onFixed` / `onUpdate`: ahí todos
ven los mismos flancos. **Un menú o una pausa que frenan el mundo** llaman a `game.pause()` en su
`enter` y a `game.resume()` en su `exit`: no corren pasos fijos ni temporizadores, pero su
`update` sí (con dt 0), y ahí leen la entrada. `game.snap(entidad)` dibuja un teletransporte sin
interpolar.

## Con los otros motores de la suite

El juego no importa ningún motor: los recibe ya creados y los usa por su forma. Los cuatro juntos,
cada uno con lo suyo:

```js
import { createEngine } from 'threejs-render-engine';                 // cómo se ve
import { createSpriteEngine } from 'threejs-sprite-engine/three';     // pixel art en 3D
import { createParticleEngine } from 'threejs-particle-engine/three'; // humo, chispas
import { createGame } from 'threejs-game-engine/three';               // el juego

const motor = createEngine(document.body, { preset: 'warm', area: 30 });
const sprites = createSpriteEngine();
const particulas = createParticleEngine();
motor.onFrame((dt) => sprites.update(dt, motor.camera));
motor.onFrame((dt) => particulas.update(dt, motor.camera));

const juego = createGame({ engine: motor, bindings: CONTROLES });

const hoja = await sprites.sheet(asepriteJson, { image: 'heroe.png' });
const sprite = sprites.sprite({ sheet: hoja, clip: 'idle', pixelsPerUnit: 32, billboard: 'y' });
const polvo = particulas.emitter({ extends: 'polvo', rate: 0 });

// un sprite y un emisor son entidades con su .object: el juego los cuelga en motor.content y les
// copia el transform (al sprite, la guiñada va a su facing: se orienta solo hacia la cámara)
const heroe = juego.world.add({ name: 'heroe', object3d: sprite, transform: { position: [0, 0, 0], rotation: [0, 0, 0] } });
const nube = juego.world.add({ object3d: polvo, transform: { position: [0, 0, 0] } });

juego.events.on('salto', () => {
  sprite.play('jump');
  nube.transform.position = [...heroe.transform.position];   // el polvo, a los pies
  juego.snap(nube);                                          // ahí, sin interpolar desde donde estaba
  polvo.burst(12);
});
juego.camera.follow(heroe, { mode: 'top' });           // view.suspend('game') mientras la cámara es del juego
juego.start();
```

| | |
|---|---|
| `engine.onFrame(fn)` | el juego corre su loop ahí (lo único que hace falta) |
| `engine.view.set(estado)` | la cámara de juego la mueve con `{ position, target }` |
| `engine.view.suspend(name)` | bloquea la órbita del usuario mientras la cámara es del juego |
| `engine.view.claim(fn)` | el gesto de un botón del mouse que es de una acción es del juego, no de la órbita |
| `engine.content` | ahí se cuelga el `object3d` de una entidad que no tiene padre |
| `object3d` | un `THREE.Object3D`, o algo con `.object` (un sprite, un emisor); con `facing`, recibe la guiñada |
| `userData.noCollide` | la cámara (`collide: true`) no choca con ese objeto (el piso, las monedas, un sprite) |

Con un motor que no es threejs-render-engine alcanza con `onFrame(fn)` (y `view.set` para la
cámara): `examples/index.html` arma uno de diez líneas sobre three y OrbitControls.

## Lo que todavía no hace

- **Física** con [Rapier](https://rapier.rs): un adaptador aparte, cargado a pedido
  (`@dimforge/rapier3d-compat`). Hoy la física es de la app, en un sistema.
- **Audio**: Web Audio, sonido posicional.
- **Carga de assets** con progreso (glTF, texturas, audio), con caché.
- **Guardar partida** en `localStorage` / IndexedDB: hoy `world.toJSON()` da los datos y la app
  los guarda donde quiera.
- **Red** (multijugador).
- El mouse como eje (mirar con el mouse, *pointer lock*, la rueda) y varios jugadores locales
  (un gamepad por jugador): hoy los gamepads se juntan en uno.

## Pruebas

```
npm test            # node --test: lo puro y el contrato, en Node
npm run typecheck   # tsc estricto sobre src/ (JSDoc, sin build)
```

Lo que dibuja se prueba a ojo en `examples/index.html` (servido por HTTP: `python3 -m
http.server` en la raíz del repo y abrir `/examples/`).

## Contribuir

El motor es agnóstico: no entra la regla de un juego, entra la herramienta que resuelve esa clase
de problema para cualquier juego. Qué entra y cómo se evalúa un pedido está en
[`POLITICA.md`](POLITICA.md); cómo se contribuye, en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licencia

MIT
