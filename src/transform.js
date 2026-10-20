// El componente `transform` de una entidad, como valores planos, y la interpolación entre dos
// pasos fijos: la lógica mueve el transform a 60 Hz y lo que se dibuja se interpola con
// `alpha`, así anda suave en una pantalla de 144 Hz y sin saltos en una de 50.
//
//   { position: [x, y, z], rotation: [x, y, z], scale: [x, y, z] }
//
// `rotation` son ángulos de Euler en radianes (el orden lo pone el objeto que se dibuja; el de
// three, por defecto, es XYZ). Para un personaje alcanza con la guiñada, `rotation[1]`. Todo
// es opcional: lo que no está no se toca.
//
// Puro: no importa three ni DOM.

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{ position?: Vec3, rotation?: Vec3, scale?: Vec3 }} Transform */

const CLAVES = ['position', 'rotation', 'scale'];

/** @param {unknown} v @param {string} que @returns {Vec3} */
function vec3(v, que) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new TypeError(`${que}: va [x, y, z] con números finitos (llegó ${JSON.stringify(v)})`);
  }
  return /** @type {Vec3} */ (v);
}

/**
 * Valida un transform y devuelve el mismo objeto (no lo copia: la lógica lo sigue moviendo).
 * Un número en `scale` es la misma escala en los tres ejes, y queda como [s, s, s].
 * @param {unknown} t @param {string} [que] @returns {Transform}
 */
export function checkTransform(t, que = 'transform') {
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw new TypeError(`${que}: va { position?, rotation?, scale? }`);
  const o = /** @type {Record<string, unknown>} */ (t);
  for (const k of Object.keys(o)) if (!CLAVES.includes(k)) throw new Error(`${que}: clave desconocida: ${k} (van ${CLAVES.join(', ')})`);
  if (typeof o.scale === 'number') o.scale = [o.scale, o.scale, o.scale];
  for (const k of CLAVES) if (o[k] !== undefined) vec3(o[k], `${que}.${k}`);
  return /** @type {Transform} */ (o);
}

/** El ángulo de `a` a `b` por el camino más corto, en radianes (de −π a π). @param {number} a @param {number} b */
export function angleDelta(a, b) {
  const d = (b - a) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
}

/** De `a` a `b` por el camino más corto. @param {number} a @param {number} b @param {number} t */
export const lerpAngle = (a, b, t) => a + angleDelta(a, b) * t;

/** Una copia de los valores de un transform (lo que se guarda del paso anterior). @param {Transform} t @returns {Transform} */
export function copyTransform(t) {
  /** @type {Transform} */ const o = {};
  if (t.position) o.position = [t.position[0], t.position[1], t.position[2]];
  if (t.rotation) o.rotation = [t.rotation[0], t.rotation[1], t.rotation[2]];
  if (t.scale) o.scale = [t.scale[0], t.scale[1], t.scale[2]];
  return o;
}

/**
 * Lo que se dibuja entre el paso anterior y el actual: posición y escala en línea recta, los
 * ángulos por el camino más corto. Lo que el anterior no tiene sale del actual tal cual.
 * @param {Transform | null | undefined} prev @param {Transform} cur @param {number} alpha
 * @returns {Transform}
 */
export function blendTransform(prev, cur, alpha) {
  const a = Math.min(1, Math.max(0, alpha));
  /** @type {Transform} */ const o = {};
  /** @param {Vec3 | undefined} p @param {Vec3} c @param {boolean} ang @returns {Vec3} */
  const mezcla = (p, c, ang) => (p ? /** @type {Vec3} */ ([0, 1, 2].map((i) => (ang ? lerpAngle(p[i], c[i], a) : p[i] + (c[i] - p[i]) * a))) : [c[0], c[1], c[2]]);
  if (cur.position) o.position = mezcla(prev?.position, cur.position, false);
  if (cur.rotation) o.rotation = mezcla(prev?.rotation, cur.rotation, true);
  if (cur.scale) o.scale = mezcla(prev?.scale, cur.scale, false);
  return o;
}
