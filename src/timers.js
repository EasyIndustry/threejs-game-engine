// Temporizadores con el tiempo del juego: `after(s, fn)` una vez, `every(s, fn)` cada tanto.
// Corren cuando alguien llama a `update(dt)` — el juego lo hace en cada paso fijo —, así la
// pausa y la cámara lenta los frenan igual que al resto del juego.
//
//   const cancelar = timers.after(2, () => abrirPuerta());
//   timers.every(0.5, (n) => disparar(n));       // n: la vez (1, 2, 3…)
//
// Determinista: un update(1) da lo mismo que dos update(0.5). Si un dt salta varios disparos,
// corren todos, en orden de tiempo (y entre dos del mismo tiempo, en el orden en que se
// crearon); uno que se crea adentro de otro empieza a contar desde el momento del que lo creó.
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { TIMERS_MEMBERS } from './members.js';

/**
 * @typedef {{ id: number, at: number, every: number, fn: (n: number) => void, n: number, vivo: boolean }} Timer
 */

/** @param {unknown} s @param {string} que @param {boolean} cero */
function segundos(s, que, cero) {
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || (!cero && s === 0)) throw new RangeError(`${que}(s, fn): s va en segundos de juego, ${cero ? '0' : 'mayor que 0'} o más (llegó ${JSON.stringify(s)})`);
  return s;
}

/** Los temporizadores del juego. */
export function createTimers() {
  /** @type {Timer[]} */ let lista = [];
  let ahora = 0, siguiente = 1;

  /** @param {number} espera @param {number} cada @param {(n: number) => void} fn */
  function agregar(espera, cada, fn) {
    if (typeof fn !== 'function') throw new TypeError('va una función');
    /** @type {Timer} */
    const t = { id: siguiente++, at: ahora + espera, every: cada, fn, n: 0, vivo: true };
    lista.push(t);
    return () => { const era = t.vivo; t.vivo = false; return era; };
  }
  /** El próximo que toca hasta `fin` (el de menor tiempo; empate, el más viejo). @param {number} fin */
  function proximo(fin) {
    /** @type {Timer | null} */ let mejor = null;
    for (const t of lista) if (t.vivo && t.at <= fin && (!mejor || t.at < mejor.at || (t.at === mejor.at && t.id < mejor.id))) mejor = t;
    return mejor;
  }

  const timers = {
    /** Una vez, dentro de `s` segundos de juego; devuelve cómo cancelarlo (true si estaba pendiente). @param {number} s @param {(n: number) => void} fn */
    after(s, fn) { return agregar(segundos(s, 'after', true), 0, fn); },
    /** Cada `s` segundos de juego (la primera, dentro de s); fn recibe la vez (1, 2…). Devuelve cómo cancelarlo. @param {number} s @param {(n: number) => void} fn */
    every(s, fn) { const c = segundos(s, 'every', false); return agregar(c, c, fn); },
    /** Avanza el tiempo `dt` segundos y corre lo que toca, en orden. @param {number} dt */
    update(dt) {
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new RangeError(`update(dt): va en segundos, 0 o más (llegó ${dt})`);
      const fin = ahora + dt;
      for (let t = proximo(fin); t; t = proximo(fin)) {
        ahora = t.at;
        t.n++;
        if (t.every > 0) t.at += t.every; else t.vivo = false;
        try { t.fn(t.n); } catch (err) { console.error('timers: un temporizador falló', err); }
      }
      ahora = fin;
      if (lista.some((t) => !t.vivo)) lista = lista.filter((t) => t.vivo);
    },
    /** El tiempo de los temporizadores, en segundos (lo que avanzó con update). */
    get time() { return ahora; },
    /** Cuántos hay pendientes. */
    get size() { return lista.filter((t) => t.vivo).length; },
    /** Cancela todos. */
    clear() { for (const t of lista) t.vivo = false; lista = []; },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Timers — temporizadores con el tiempo del juego', TIMERS_MEMBERS, o); },
  };
  return timers;
}
