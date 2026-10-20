// La cámara de juego, pura: sigue a un objetivo (su posición y su rumbo) y devuelve un estado
// plano `{ position, target }` suavizado — la forma de `view.set()` de threejs-render-engine.
//
//   const cam = followCamera({ mode: 'behind', damping: 0.15, lookAhead: 1 });
//   motor.onFrame((dt) => motor.view.set(cam.update({ position: [x, y, z], heading }, dt)));
//
// Modos (cada uno con su offset y su punto de mira por defecto, en metros: en otra unidad, pasá
// los tuyos):
//   behind   tercera persona: detrás del objetivo, gira con él. offset y look van en el marco
//            del objetivo: [derecha, arriba, adelante]; [0, 2.5, -6] es 6 atrás y 2.5 arriba.
//   top      cenital fija (estilo isométrico, ideal para pixel art): no gira; offset y look van
//            en el mundo.
//   side     lateral (plataformas 2.5D): no gira, mira de costado; offset y look en el mundo.
//
// El rumbo (`heading`) es la guiñada en radianes: 0 mira hacia +z y crece hacia +x (lo mismo que
// `rotation.y` de un Object3D, cuyo +z local es su frente).
//
// **Amortiguación crítica.** El punto que se sigue (y el rumbo, en `behind`) se mueven con un
// resorte críticamente amortiguado: llegan sin pasarse ni oscilar, y la cuenta es la solución
// exacta del resorte, así que da lo mismo a 30 que a 144 cuadros por segundo. `damping` es el
// tiempo de suavizado en segundos (0: rígida); con [x, y, z], uno por eje (una cámara de
// plataformas que sigue rápido en x y lento en y).
//
// **Choques.** `collide(desde, hasta)` es de la app (un rayo contra su escena): devuelve a qué
// distancia de `desde` (el punto de mira) choca el segmento hasta la cámara, o null si no
// choca. La cámara se acerca de una (no atraviesa la pared) y vuelve a alejarse suave.
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { FOLLOW_MEMBERS } from './members.js';
import { angleDelta } from './transform.js';

/**
 * @typedef {[number, number, number]} Vec3
 * @typedef {'behind' | 'top' | 'side'} FollowMode
 * @typedef {(from: Vec3, to: Vec3) => number | null | undefined} CollideFn
 * @typedef {{ mode: FollowMode, offset: Vec3, look: Vec3, lookAhead: number, damping: Vec3, turnDamping: number, collide: CollideFn | null, collideDamping: number }} FollowOptions
 * @typedef {{ position: Vec3, heading?: number }} Subject
 * @typedef {{ position: Vec3, target: Vec3 }} FollowState
 */

/** Lo que pone cada modo si no se pasa offset ni look. */
export const FOLLOW_MODES = Object.freeze({
  behind: Object.freeze({ offset: Object.freeze([0, 2.5, -6]), look: Object.freeze([0, 1.2, 0]) }),
  top: Object.freeze({ offset: Object.freeze([0, 12, 8]), look: Object.freeze([0, 0, 0]) }),
  side: Object.freeze({ offset: Object.freeze([0, 1.5, 14]), look: Object.freeze([0, 1, 0]) }),
});

const CLAVES = ['mode', 'offset', 'look', 'lookAhead', 'damping', 'turnDamping', 'collide', 'collideDamping'];

/** @param {unknown} v @param {string} que @returns {Vec3} */
function vec3(v, que) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new TypeError(`${que}: va [x, y, z] con números finitos (llegó ${JSON.stringify(v)})`);
  }
  return [v[0], v[1], v[2]];
}
/** @param {unknown} v @param {string} que @param {number} def */
function noNegativo(v, que, def) {
  if (v === undefined) return def;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`${que}: va un número de 0 en adelante (llegó ${JSON.stringify(v)})`);
  return v;
}

/**
 * Las opciones de la cámara que sigue, validadas y completas (con los valores del modo).
 * @param {Record<string, unknown>} [def] @returns {FollowOptions}
 */
export function defineFollow(def = {}) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) throw new TypeError('followCamera: va un objeto { mode, offset, look, lookAhead, damping, … }');
  for (const k of Object.keys(def)) if (!CLAVES.includes(k)) throw new Error(`followCamera: clave desconocida: ${k} (van ${CLAVES.join(', ')})`);
  const mode = /** @type {FollowMode} */ (def.mode ?? 'behind');
  if (!(mode in FOLLOW_MODES)) throw new Error(`followCamera.mode: va ${Object.keys(FOLLOW_MODES).map((m) => `'${m}'`).join(', ')} (llegó ${JSON.stringify(def.mode)})`);
  const offset = vec3(def.offset ?? FOLLOW_MODES[mode].offset, 'followCamera.offset');
  if (!(Math.hypot(...offset) > 0)) throw new RangeError('followCamera.offset: la cámara no puede estar en el objetivo ([0, 0, 0])');
  const look = vec3(def.look ?? FOLLOW_MODES[mode].look, 'followCamera.look');
  /** @type {Vec3} */ let damping;
  if (Array.isArray(def.damping)) damping = /** @type {Vec3} */ (vec3(def.damping, 'followCamera.damping').map((x, i) => noNegativo(x, `followCamera.damping[${i}]`, 0)));
  else { const d = noNegativo(def.damping, 'followCamera.damping', 0.15); damping = [d, d, d]; }
  if (def.collide !== undefined && def.collide !== null && typeof def.collide !== 'function') throw new TypeError('followCamera.collide: va una función (desde, hasta) => distancia | null');
  return {
    mode, offset, look,
    lookAhead: noNegativo(def.lookAhead, 'followCamera.lookAhead', 0),
    damping,
    turnDamping: noNegativo(def.turnDamping, 'followCamera.turnDamping', 0.3),
    collide: /** @type {CollideFn | null} */ (def.collide ?? null),
    collideDamping: noNegativo(def.collideDamping, 'followCamera.collideDamping', 0.3),
  };
}

/**
 * Un paso de un resorte críticamente amortiguado hacia `target` (quieto durante el paso): la
 * solución exacta, así que n pasos de dt/n dan lo mismo que uno de dt. `smoothTime` en segundos
 * (0: llega de una). Devuelve [valor, velocidad].
 * @param {number} x @param {number} v @param {number} target @param {number} smoothTime @param {number} dt
 * @returns {[number, number]}
 */
export function damp(x, v, target, smoothTime, dt) {
  if (!(smoothTime > 0)) return [target, 0];
  const w = 2 / smoothTime;
  const y = x - target;
  const e = Math.exp(-w * dt);
  const t = (v + w * y) * dt;
  return [target + (y + t) * e, (v - w * t) * e];
}

/** Como damp, para un ángulo en radianes: va por el camino más corto. @param {number} a @param {number} v @param {number} target @param {number} smoothTime @param {number} dt @returns {[number, number]} */
export function dampAngle(a, v, target, smoothTime, dt) {
  const [y, nv] = damp(-angleDelta(a, target), v, 0, smoothTime, dt);
  return [target + y, nv];
}

/** @param {Vec3} v @param {number} h el rumbo: [derecha, arriba, adelante] → mundo @returns {Vec3} */
function alMundo(v, h) {
  const s = Math.sin(h), c = Math.cos(h);
  // adelante = [sin h, 0, cos h], derecha = adelante × arriba = [−cos h, 0, sin h]
  return [-c * v[0] + s * v[2], v[1], s * v[0] + c * v[2]];
}

/**
 * Una cámara que sigue a un objetivo.
 * @param {Record<string, unknown>} [opts]
 */
export function followCamera(opts = {}) {
  /** Lo que pidió la app, para pisarlo con options(). @type {Record<string, unknown>} */
  let pedido = { ...opts };
  let O = defineFollow(pedido);
  /** @type {Vec3} */ let foco = [0, 0, 0];
  /** @type {Vec3} */ let velFoco = [0, 0, 0];
  let rumbo = 0, velRumbo = 0, alcance = 1, velAlcance = 0;
  let iniciada = false;
  /** @type {FollowState | null} */ let ultimo = null;

  const rig = {
    /**
     * Un cuadro: dado el objetivo { position, heading? } y dt (segundos), el estado de la cámara
     * { position, target }, listo para view.set().
     * @param {Subject} subject @param {number} dt @returns {FollowState}
     */
    update(subject, dt) {
      if (!subject || typeof subject !== 'object') throw new TypeError('update(subject, dt): va { position: [x, y, z], heading? }');
      const p = vec3(subject.position, 'update: subject.position');
      const h = subject.heading ?? rumbo;
      if (typeof h !== 'number' || !Number.isFinite(h)) throw new TypeError(`update: subject.heading va en radianes (llegó ${JSON.stringify(subject.heading)})`);
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new RangeError(`update(subject, dt): dt va en segundos, 0 o más (llegó ${dt})`);

      // hacia dónde mira el objetivo: en behind, el rumbo suavizado; en los otros, el de ahora
      if (!iniciada) { rumbo = h; velRumbo = 0; }
      else if (O.mode === 'behind') [rumbo, velRumbo] = dampAngle(rumbo, velRumbo, h, O.turnDamping, dt);
      else { rumbo = h; velRumbo = 0; }

      /** @type {Vec3} */ let adelante = [Math.sin(rumbo) * O.lookAhead, 0, Math.cos(rumbo) * O.lookAhead];
      if (O.mode === 'side') {
        // de costado, mirar adelante es correrse en la pantalla, no acercarse
        const n = Math.hypot(O.offset[0], O.offset[2]);
        if (n > 0) {
          const k = (adelante[0] * O.offset[0] + adelante[2] * O.offset[2]) / (n * n);
          adelante = [adelante[0] - O.offset[0] * k, 0, adelante[2] - O.offset[2] * k];
        }
      }
      /** @type {Vec3} */ const deseado = [p[0] + adelante[0], p[1] + adelante[1], p[2] + adelante[2]];
      if (!iniciada) { foco = deseado; velFoco = [0, 0, 0]; }
      else for (let i = 0; i < 3; i++) [foco[i], velFoco[i]] = damp(foco[i], velFoco[i], deseado[i], O.damping[i], dt);

      const giro = O.mode === 'behind' ? rumbo : 0;
      const marco = (/** @type {Vec3} */ v) => (O.mode === 'behind' ? alMundo(v, giro) : v);
      const l = marco(O.look), o = marco(O.offset);
      /** @type {Vec3} */ const target = [foco[0] + l[0], foco[1] + l[1], foco[2] + l[2]];
      /** @type {Vec3} */ let position = [foco[0] + o[0], foco[1] + o[1], foco[2] + o[2]];

      // choques: se acerca de una y se aleja suave
      let quiere = 1;
      if (O.collide) {
        const largo = Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
        const libre = O.collide([...target], [...position]);
        if (typeof libre === 'number' && Number.isFinite(libre) && largo > 0 && libre < largo) quiere = Math.max(0.05, libre / largo);
      }
      if (!iniciada || quiere <= alcance) { alcance = quiere; velAlcance = 0; }
      else [alcance, velAlcance] = damp(alcance, velAlcance, quiere, O.collideDamping, dt);
      if (alcance < 1) position = [target[0] + (position[0] - target[0]) * alcance, target[1] + (position[1] - target[1]) * alcance, target[2] + (position[2] - target[2]) * alcance];

      // si el punto de mira y la cámara quedaron juntos (offset igual a look), se separa un poco
      if (!(Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) > 1e-9)) position = [target[0], target[1] + 1e-3, target[2]];

      iniciada = true;
      ultimo = { position, target };
      return { position: [...position], target: [...target] };
    },
    /** La próxima actualización va directo, sin suavizar (al empezar a seguir, o tras un teletransporte). */
    reset() { iniciada = false; },
    /** El último estado que dio update, o null. */
    get state() { return ultimo && { position: /** @type {Vec3} */ ([...ultimo.position]), target: /** @type {Vec3} */ ([...ultimo.target]) }; },
    /**
     * Cambiar opciones (lo que no se pasa queda); sin argumentos, cómo están. Cambiar de modo
     * vuelve a los offset y look de ese modo, salvo que se pasen.
     * @param {Record<string, unknown>} [o] @returns {FollowOptions}
     */
    options(o) {
      if (o === undefined) return { ...O, offset: [...O.offset], look: [...O.look], damping: [...O.damping] };
      let base = pedido;
      if (o.mode !== undefined && o.mode !== O.mode) { const { offset: _o, look: _l, ...resto } = pedido; base = resto; }
      const nuevo = { ...base, ...o };
      O = defineFollow(nuevo);
      pedido = nuevo;
      return rig.options();
    },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('followCamera — la cámara de juego', FOLLOW_MEMBERS, o); },
  };
  return rig;
}
