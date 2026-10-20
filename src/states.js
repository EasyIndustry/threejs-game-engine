// Los estados del juego, en una pila: el menú, el nivel, la pausa encima del nivel. Solo corre
// el de arriba; el de abajo queda en pausa hasta que el de arriba se va.
//
//   const states = createStates();
//   states.push(menu);                 // menu.enter()
//   states.replace(nivel, 1);          // menu.exit(), nivel.enter(1)
//   states.push(pausa);                // nivel.pause(), pausa.enter()
//   states.pop();                      // pausa.exit(), nivel.resume()
//
// Un estado es un objeto con lo que necesite de esto, todo opcional:
//   { name, enter(...args), exit(), pause(), resume(), fixed(dt), update(dt, alpha) }
// Puede tener sus propios datos (cualquier clave que no sea una función); una función con un
// nombre que no es de la lista es un error (un `entre` mal escrito no se ignora en silencio).
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { STATES_MEMBERS } from './members.js';

/**
 * @typedef {{ name?: string, enter?: (...args: any[]) => void, exit?: () => void, pause?: () => void, resume?: () => void, fixed?: (dt: number) => void, update?: (dt: number, alpha: number) => void, [k: string]: unknown }} GameState
 * @typedef {{ action: 'push' | 'pop' | 'replace' | 'clear', current: GameState | null, previous: GameState | null }} StateChange
 */

const GANCHOS = ['enter', 'exit', 'pause', 'resume', 'fixed', 'update'];

/**
 * Que sea un estado: un objeto cuyas funciones son ganchos conocidos.
 * @param {unknown} s @param {string} que @returns {GameState}
 */
export function checkState(s, que) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new TypeError(`${que}: va un estado { name?, enter?, exit?, pause?, resume?, fixed?, update? }`);
  for (const [k, v] of Object.entries(s)) {
    if (GANCHOS.includes(k) && v !== undefined && typeof v !== 'function') throw new TypeError(`${que}.${k}: va una función`);
    if (typeof v === 'function' && !GANCHOS.includes(k)) throw new Error(`${que}: clave desconocida: ${k} (los ganchos son ${GANCHOS.join(', ')})`);
  }
  return /** @type {GameState} */ (s);
}

/** El nombre de un estado, para los errores y la depuración. @param {GameState | null | undefined} s */
const nombreDe = (s) => (s ? (typeof s.name === 'string' && s.name) || 'estado sin nombre' : 'ninguno');

/** La pila de estados del juego. */
export function createStates() {
  /** @type {GameState[]} */ const pila = [];
  /** @type {Set<(c: StateChange) => void>} */ const avisos = new Set();
  const arriba = () => pila[pila.length - 1] ?? null;
  /** @param {StateChange['action']} action @param {GameState | null} previous */
  function avisar(action, previous) {
    const c = { action, current: arriba(), previous };
    for (const fn of [...avisos]) fn(c);
  }

  const states = {
    /** Pone un estado arriba: el de abajo recibe pause() y el nuevo enter(...args). @param {GameState} state @param {...any} args */
    push(state, ...args) {
      checkState(state, 'push');
      if (pila.includes(state)) throw new Error(`push: ${nombreDe(state)} ya está en la pila`);
      const antes = arriba();
      antes?.pause?.();
      pila.push(state);
      state.enter?.(...args);
      avisar('push', antes);
      return states;
    },
    /** Saca el de arriba (exit) y el de abajo sigue (resume). Devuelve el que sacó, o null si no había. */
    pop() {
      const sale = pila.pop() ?? null;
      if (!sale) return null;
      sale.exit?.();
      arriba()?.resume?.();
      avisar('pop', sale);
      return sale;
    },
    /** Cambia el de arriba por otro: el viejo recibe exit() y el nuevo enter(...args). @param {GameState} state @param {...any} args */
    replace(state, ...args) {
      checkState(state, 'replace');
      const sale = pila.pop() ?? null;
      if (pila.includes(state)) { if (sale) pila.push(sale); throw new Error(`replace: ${nombreDe(state)} ya está en la pila`); }
      sale?.exit?.();
      pila.push(state);
      state.enter?.(...args);
      avisar('replace', sale);
      return states;
    },
    /** Saca todos, de arriba hacia abajo (cada uno recibe exit). */
    clear() {
      const antes = arriba();
      while (pila.length) pila.pop()?.exit?.();
      if (antes) avisar('clear', antes);
    },
    /** El estado de arriba (el que corre), o null. */
    get current() { return arriba(); },
    /** La pila, de abajo hacia arriba (una copia). */
    get stack() { return [...pila]; },
    /** Corre el paso fijo del estado de arriba. @param {number} dt */
    fixed(dt) { arriba()?.fixed?.(dt); },
    /** Corre el cuadro del estado de arriba. @param {number} dt @param {number} [alpha] */
    update(dt, alpha = 1) { arriba()?.update?.(dt, alpha); },
    /** Algo que corre cuando cambia la pila: { action, current, previous }; devuelve cómo sacarlo. @param {(c: StateChange) => void} fn */
    onChange(fn) {
      if (typeof fn !== 'function') throw new TypeError('onChange(fn): va una función');
      avisos.add(fn);
      return () => { avisos.delete(fn); };
    },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('States — la pila de estados del juego', STATES_MEMBERS, o); },
  };
  return states;
}
