// La entrada como acciones: la app dice qué acciones hay ("saltar", "disparar", "mover") y con
// qué se hacen; el juego pregunta por la acción, no por la tecla. Así el jugador puede cambiar
// los controles (rebind) y el mismo código anda con teclado, mouse y gamepad.
//
//   const input = createInput({
//     saltar:   ['Space', 'pad:a'],
//     disparar: ['mouse:0', 'pad:rt'],
//     mover:    { type: 'axis2', keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, pad: 'pad:left' },
//   });
//   input.justPressed('saltar');   input.axis2('mover');   // → [x, y], con zona muerta
//
// Los códigos:
//   teclado   el de KeyboardEvent.code: 'KeyW', 'Space', 'ArrowUp', 'ShiftLeft', 'Digit1'…
//             (la tecla física: WASD queda en el mismo lugar en un teclado AZERTY)
//   mouse     'mouse:0' izquierdo, 'mouse:1' medio, 'mouse:2' derecho, 'mouse:3' y 'mouse:4'
//   gamepad   el mapeo estándar: 'pad:a', 'pad:b', 'pad:x', 'pad:y', 'pad:lb', 'pad:rb', 'pad:lt',
//             'pad:rt', 'pad:select', 'pad:start', 'pad:ls', 'pad:rs', 'pad:up', 'pad:down',
//             'pad:left', 'pad:right', 'pad:home' (botones). En un eje (axis2), 'pad:left' y
//             'pad:right' son los sticks, y 'pad:dpad' la cruz.
//
// El núcleo no lee el DOM: recibe eventos planos (press, release, axis, pad) y el adaptador se
// los pasa desde el teclado, el mouse y el Gamepad API.
//
// **justPressed con el paso fijo.** Un cuadro puede correr 0, 1 o varios pasos fijos. Para que
// un toque no se pierda ni se cuente dos veces, los flancos (justPressed, justReleased) se
// latchean: quedan prendidos desde que llega el evento hasta que termina el primer paso fijo
// que los vio (`endStep()`, o el `beginStep()` del paso siguiente). Si en ese cuadro no hubo
// pasos, siguen prendidos para el próximo.
// Afuera de un paso fijo (fuera de `beginStep()` … `endStep()`: un menú que corre por cuadro),
// valen los flancos del cuadro, que se apagan en `endFrame()`. Un toque
// rapidísimo (apretar y soltar entre dos cuadros) da justPressed y justReleased, aunque
// pressed ya sea false.
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { INPUT_MEMBERS } from './members.js';

/** Los botones del mapeo estándar del Gamepad API, en el orden de sus índices. */
export const PAD_BUTTONS = Object.freeze(['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right', 'home']);
/** Los sticks del mapeo estándar, con los índices de sus ejes [x, y]. */
export const PAD_STICKS = Object.freeze({ left: Object.freeze([0, 1]), right: Object.freeze([2, 3]) });
/** Lo que puede ir en `pad` de un eje: los dos sticks y la cruz. */
const PAD_EJES = Object.freeze(['pad:left', 'pad:right', 'pad:dpad']);
const DIRECCIONES = /** @type {const} */ (['up', 'down', 'left', 'right']);

/**
 * @typedef {string[]} ButtonBinding
 * @typedef {{ type: 'axis2', keys: { up: string[], down: string[], left: string[], right: string[] }, pad: string | null, deadzone: number }} Axis2Binding
 * @typedef {ButtonBinding | Axis2Binding} Binding
 * @typedef {Record<string, Binding>} Bindings
 * @typedef {{ buttons: Record<string, number>, sticks: { left: [number, number], right: [number, number] } }} PadSnapshot
 */

const plano = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Valida un código y lo devuelve: teclado (KeyboardEvent.code), 'mouse:N' o 'pad:boton'.
 * @param {unknown} c @param {string} que
 */
function codigo(c, que) {
  if (typeof c !== 'string' || !c) throw new TypeError(`${que}: va un código ('KeyW', 'Space', 'mouse:0', 'pad:a'), llegó ${JSON.stringify(c)}`);
  if (c.startsWith('mouse:')) {
    if (!/^mouse:[0-4]$/.test(c)) throw new Error(`${que}: '${c}' no es un botón del mouse (van 'mouse:0' a 'mouse:4')`);
    return c;
  }
  if (c.startsWith('pad:')) {
    if (!PAD_BUTTONS.includes(c.slice(4))) throw new Error(`${que}: '${c}' no es un botón del gamepad (van ${PAD_BUTTONS.map((b) => `pad:${b}`).join(', ')})`);
    return c;
  }
  if (c.length === 1) {
    const sug = /[a-z]/i.test(c) ? `Key${c.toUpperCase()}` : /\d/.test(c) ? `Digit${c}` : c === ' ' ? 'Space' : null;
    throw new Error(`${que}: '${c}' es una letra, no un código: va el de KeyboardEvent.code${sug ? ` ('${sug}')` : ''}`);
  }
  if (!/^[A-Z][A-Za-z0-9]*$/.test(c)) throw new Error(`${que}: '${c}' no es un código de teclado: va el de KeyboardEvent.code ('KeyW', 'Space', 'ArrowUp'), 'mouse:0' o 'pad:a'`);
  return c;
}

/** @param {unknown} v @param {string} que @returns {string[]} */
function codigos(v, que) {
  if (v === undefined || v === null) return [];
  const lista = typeof v === 'string' ? [v] : v;
  if (!Array.isArray(lista)) throw new TypeError(`${que}: va un código o una lista de códigos`);
  const out = lista.map((c, i) => codigo(c, `${que}[${i}]`));
  return [...new Set(out)];
}

/**
 * Una acción: una lista de códigos (botón) o un eje { type: 'axis2', keys, pad, deadzone }.
 * @param {unknown} v @param {string} que @returns {Binding}
 */
function accionDe(v, que) {
  if (typeof v === 'string' || Array.isArray(v)) return codigos(v, que);
  if (!plano(v)) throw new TypeError(`${que}: va una lista de códigos (un botón) o { type: 'axis2', keys, pad } (un eje)`);
  const o = /** @type {Record<string, unknown>} */ (v);
  const conocidas = ['type', 'keys', 'pad', 'deadzone', 'codes'];
  for (const k of Object.keys(o)) if (!conocidas.includes(k)) throw new Error(`${que}: clave desconocida: ${k} (van ${conocidas.join(', ')})`);
  if (o.type === 'button') {
    for (const k of ['keys', 'pad', 'deadzone']) if (k in o) throw new Error(`${que}.${k}: es de un eje; un botón va { type: 'button', codes }`);
    return codigos(o.codes, `${que}.codes`);
  }
  if (o.type !== 'axis2') throw new Error(`${que}.type: va 'button' o 'axis2' (llegó ${JSON.stringify(o.type)})`);
  if ('codes' in o) throw new Error(`${que}.codes: es de un botón; un eje va { type: 'axis2', keys, pad }`);
  const keys = o.keys ?? {};
  if (!plano(keys)) throw new TypeError(`${que}.keys: va { up, down, left, right }`);
  const k = /** @type {Record<string, unknown>} */ (keys);
  for (const d of Object.keys(k)) if (!(/** @type {readonly string[]} */ (DIRECCIONES)).includes(d)) throw new Error(`${que}.keys: clave desconocida: ${d} (van ${DIRECCIONES.join(', ')})`);
  let pad = null;
  if (o.pad !== undefined && o.pad !== null) {
    if (typeof o.pad !== 'string' || !PAD_EJES.includes(o.pad)) throw new Error(`${que}.pad: va ${PAD_EJES.map((p) => `'${p}'`).join(', ')} (llegó ${JSON.stringify(o.pad)})`);
    pad = o.pad;
  }
  const dz = o.deadzone ?? 0.15;
  if (typeof dz !== 'number' || !(dz >= 0 && dz < 1)) throw new RangeError(`${que}.deadzone: va de 0 a menos de 1 (llegó ${JSON.stringify(dz)})`);
  return {
    type: 'axis2',
    keys: { up: codigos(k.up, `${que}.keys.up`), down: codigos(k.down, `${que}.keys.down`), left: codigos(k.left, `${que}.keys.left`), right: codigos(k.right, `${que}.keys.right`) },
    pad, deadzone: dz,
  };
}

/**
 * Los controles como datos, validados y en su forma completa: un botón es una lista de códigos;
 * un eje, `{ type: 'axis2', keys: { up, down, left, right }, pad, deadzone }` con listas. La
 * forma completa también es una entrada válida (lo que devuelve `bindings()` se puede guardar
 * y volver a cargar).
 * @param {Record<string, unknown>} def @returns {Bindings}
 */
export function defineBindings(def) {
  if (!plano(def)) throw new TypeError('bindings: va un objeto { accion: códigos | { type: \'axis2\', … } }');
  /** @type {Bindings} */
  const out = {};
  for (const [nombre, v] of Object.entries(def)) {
    if (!nombre) throw new Error('bindings: una acción sin nombre');
    out[nombre] = accionDe(v, nombre);
  }
  return out;
}

/** @param {number} x */ const recorte = (x) => Math.max(-1, Math.min(1, x));

/**
 * Lo que dicen los gamepads conectados, como datos planos: los botones apretados (con su valor,
 * de 0 a 1) y los dos sticks con y positiva hacia arriba. Con varios gamepads, un botón está
 * apretado si lo está en cualquiera, y cada stick es el que más se mueve. Solo cuenta el mapeo
 * estándar (`mapping: 'standard'`). Recibe lo que devuelve `navigator.getGamepads()`.
 * @param {ArrayLike<any> | null | undefined} pads @returns {PadSnapshot}
 */
export function readGamepads(pads) {
  /** @type {PadSnapshot} */
  const snap = { buttons: {}, sticks: { left: [0, 0], right: [0, 0] } };
  for (const p of Array.from(pads ?? [])) {
    if (!p || p.connected === false || p.mapping !== 'standard') continue;
    PAD_BUTTONS.forEach((nombre, i) => {
      const b = p.buttons?.[i];
      if (!b) return;
      const pressed = typeof b === 'number' ? b > 0.5 : !!b.pressed;
      if (!pressed) return;
      const valor = typeof b === 'number' ? b : (typeof b.value === 'number' && b.value > 0 ? b.value : 1);
      snap.buttons[nombre] = Math.max(snap.buttons[nombre] ?? 0, Math.min(1, valor));
    });
    for (const [nombre, [ix, iy]] of /** @type {[('left' | 'right'), readonly number[]][]} */ (Object.entries(PAD_STICKS))) {
      const x = recorte(Number(p.axes?.[ix]) || 0), y = recorte(-(Number(p.axes?.[iy]) || 0));
      const antes = snap.sticks[nombre];
      if (Math.hypot(x, y) > Math.hypot(antes[0], antes[1])) snap.sticks[nombre] = [x, y];
    }
  }
  return snap;
}

/**
 * Un stick con zona muerta radial: adentro de la zona da [0, 0]; afuera, se reescala para que el
 * borde de la zona sea 0 y el tope 1 (sin salto), y nunca pasa de largo 1.
 * @param {number} x @param {number} y @param {number} zona @returns {[number, number]}
 */
export function deadzone(x, y, zona) {
  const m = Math.hypot(x, y);
  if (!(m > zona)) return [0, 0];
  const k = Math.min(1, (m - zona) / (1 - zona)) / m;
  return [x * k, y * k];
}

/**
 * La entrada: los controles (bindings) y el estado de cada acción.
 * @param {Record<string, unknown>} [bindings]
 */
export function createInput(bindings = {}) {
  let controles = defineBindings(bindings);
  /** Lo apretado: código → valor (0 a 1). @type {Map<string, number>} */
  const apretado = new Map();
  /** Los sticks crudos. @type {Record<string, [number, number]>} */
  const sticks = { 'pad:left': [0, 0], 'pad:right': [0, 0] };
  /**
   * El estado de cada botón: abajo, y los flancos latcheados para el paso fijo (fp, fr) y para
   * el cuadro (cp, cr).
   * @type {Map<string, { down: boolean, fp: boolean, fr: boolean, cp: boolean, cr: boolean }>}
   */
  const botones = new Map();
  /** Qué acciones usan cada código. @type {Map<string, string[]>} */
  let porCodigo = new Map();
  let enPaso = false;

  function indexar() {
    porCodigo = new Map();
    for (const [nombre, b] of Object.entries(controles)) {
      if (!Array.isArray(b)) continue;
      for (const c of b) porCodigo.set(c, [...(porCodigo.get(c) ?? []), nombre]);
      const st = botones.get(nombre) ?? { down: false, fp: false, fr: false, cp: false, cr: false };
      // al cambiar los controles no se inventan flancos: queda como está lo que ya está apretado
      st.down = b.some((c) => apretado.has(c));
      botones.set(nombre, st);
    }
    for (const n of [...botones.keys()]) if (!Array.isArray(controles[n])) botones.delete(n);
  }
  indexar();

  /** Recalcula las acciones que usan el código, y latchea los flancos. @param {string} c */
  function tocar(c) {
    for (const nombre of porCodigo.get(c) ?? []) {
      const st = /** @type {NonNullable<ReturnType<typeof botones.get>>} */ (botones.get(nombre));
      const ahora = /** @type {string[]} */ (controles[nombre]).some((x) => apretado.has(x));
      if (ahora && !st.down) { st.fp = true; st.cp = true; }
      if (!ahora && st.down) { st.fr = true; st.cr = true; }
      st.down = ahora;
    }
  }

  /** @param {string} a */
  function boton(a) {
    const b = controles[a];
    if (b === undefined) throw new Error(`acción desconocida: ${a} (van ${Object.keys(controles).join(', ') || 'ninguna'})`);
    if (!Array.isArray(b)) throw new Error(`${a} es un eje (axis2): va axis2('${a}')`);
    return /** @type {NonNullable<ReturnType<typeof botones.get>>} */ (botones.get(a));
  }
  function cerrarPaso() {
    if (!enPaso) return;
    enPaso = false;
    for (const st of botones.values()) { st.fp = false; st.fr = false; }
  }
  /** @param {string[]} cs */
  const algunoAbajo = (cs) => cs.some((c) => apretado.has(c));

  const input = {
    /**
     * Se apretó algo (una tecla, un botón del mouse o del gamepad). `value` (0 a 1) es para los
     * gatillos; apretar otra vez lo que ya está apretado solo cambia el valor.
     * @param {string} code @param {number} [value]
     */
    press(code, value = 1) {
      const c = codigo(code, 'press');
      if (typeof value !== 'number' || !(value >= 0 && value <= 1)) throw new RangeError(`press(${c}, value): va de 0 a 1 (llegó ${value})`);
      const estaba = apretado.has(c);
      apretado.set(c, value);
      if (!estaba) tocar(c);
    },
    /** Se soltó algo. Soltar lo que no estaba apretado no hace nada. @param {string} code */
    release(code) {
      const c = codigo(code, 'release');
      if (apretado.delete(c)) tocar(c);
    },
    /**
     * Un stick del gamepad: 'pad:left' o 'pad:right', con x a la derecha e y hacia arriba, de −1 a 1.
     * @param {string} name @param {number} x @param {number} y
     */
    axis(name, x, y) {
      if (name !== 'pad:left' && name !== 'pad:right') throw new Error(`axis(name): va 'pad:left' o 'pad:right' (llegó ${JSON.stringify(name)})`);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError(`axis(${name}, x, y): van números`);
      sticks[name] = [recorte(x), recorte(y)];
    },
    /**
     * Lo que dicen los gamepads (de readGamepads): aprieta y suelta los botones 'pad:…' que
     * cambiaron y pone los sticks.
     * @param {PadSnapshot} snap
     */
    pad(snap) {
      for (const b of PAD_BUTTONS) {
        const v = snap.buttons[b];
        if (v === undefined) input.release(`pad:${b}`);
        else input.press(`pad:${b}`, v);
      }
      input.axis('pad:left', snap.sticks.left[0], snap.sticks.left[1]);
      input.axis('pad:right', snap.sticks.right[0], snap.sticks.right[1]);
    },
    /** Suelta todo (al perder el foco: que no quede una tecla trabada). Da justReleased de lo que estaba apretado. */
    releaseAll() {
      for (const c of [...apretado.keys()]) input.release(c);
      sticks['pad:left'] = [0, 0];
      sticks['pad:right'] = [0, 0];
    },
    /** ¿Está apretada la acción (algún código suyo)? @param {string} action */
    pressed(action) { return boton(action).down; },
    /** ¿Se apretó recién? En un paso fijo: desde el paso anterior; afuera: en este cuadro. @param {string} action */
    justPressed(action) { const st = boton(action); return enPaso ? st.fp : st.cp; },
    /** ¿Se soltó recién? Como justPressed. @param {string} action */
    justReleased(action) { const st = boton(action); return enPaso ? st.fr : st.cr; },
    /** Cuánto está apretada (0 a 1): el valor más alto de sus códigos (un gatillo a medias, 0.5). @param {string} action */
    value(action) {
      const b = /** @type {string[]} */ (controles[action]);
      boton(action);
      let v = 0;
      for (const c of b) v = Math.max(v, apretado.get(c) ?? 0);
      return v;
    },
    /**
     * Un eje de dos dimensiones: [x, y], x a la derecha e y hacia arriba (adelante), de largo 1
     * a lo sumo. Suma las teclas (en diagonal, normalizado) y el stick o la cruz (con zona muerta).
     * @param {string} action @returns {[number, number]}
     */
    axis2(action) {
      const b = controles[action];
      if (b === undefined) throw new Error(`acción desconocida: ${action} (van ${Object.keys(controles).join(', ') || 'ninguna'})`);
      if (Array.isArray(b)) throw new Error(`${action} es un botón: va pressed('${action}'), o definila como { type: 'axis2', … }`);
      let x = (algunoAbajo(b.keys.right) ? 1 : 0) - (algunoAbajo(b.keys.left) ? 1 : 0);
      let y = (algunoAbajo(b.keys.up) ? 1 : 0) - (algunoAbajo(b.keys.down) ? 1 : 0);
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      if (b.pad === 'pad:dpad') {
        let dx = (apretado.has('pad:right') ? 1 : 0) - (apretado.has('pad:left') ? 1 : 0);
        let dy = (apretado.has('pad:up') ? 1 : 0) - (apretado.has('pad:down') ? 1 : 0);
        if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
        x += dx; y += dy;
      } else if (b.pad) {
        const [sx, sy] = deadzone(sticks[b.pad][0], sticks[b.pad][1], b.deadzone);
        x += sx; y += sy;
      }
      const m = Math.hypot(x, y);
      return m > 1 ? [x / m, y / m] : [x, y];
    },
    /**
     * Empieza un paso fijo: justPressed y justReleased dicen lo que pasó desde el paso anterior.
     * Si había un paso abierto, lo cierra antes (como endStep): así quien corre los pasos no
     * necesita un aviso después del último oyente de cada paso.
     */
    beginStep() { cerrarPaso(); enPaso = true; },
    /** Termina el paso fijo (si hay uno abierto): apaga sus flancos, el paso siguiente ya no los ve. Sin paso abierto, no hace nada. */
    endStep() { cerrarPaso(); },
    /** Termina el cuadro: apaga los flancos del cuadro. Va después de todo lo que corre por cuadro. */
    endFrame() {
      for (const st of botones.values()) { st.cp = false; st.cr = false; }
    },
    /**
     * Cambia los controles de una acción que existe (lo que el jugador eligió en el menú de
     * controles). Lo que ya estaba apretado sigue apretado, sin flancos nuevos.
     * @param {string} action @param {unknown} binding
     */
    rebind(action, binding) {
      const antes = controles[action];
      if (antes === undefined) throw new Error(`rebind: acción desconocida: ${action} (van ${Object.keys(controles).join(', ') || 'ninguna'})`);
      const nuevo = accionDe(binding, action);
      if (Array.isArray(antes) !== Array.isArray(nuevo)) throw new Error(`rebind(${action}): era ${Array.isArray(antes) ? 'un botón' : 'un eje'} y sigue siéndolo`);
      controles = { ...controles, [action]: nuevo };
      indexar();
    },
    /** Los controles en su forma completa, como datos (para guardarlos y volver a cargarlos). */
    bindings() { return /** @type {Bindings} */ (JSON.parse(JSON.stringify(controles))); },
    /** Los códigos apretados ahora (para un menú de "apretá una tecla"). */
    get down() { return [...apretado.keys()]; },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Input — la entrada como acciones', INPUT_MEMBERS, o); },
  };
  return input;
}
