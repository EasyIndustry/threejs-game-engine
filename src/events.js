// Un bus de eventos: para que los sistemas se avisen sin conocerse ("murió", "agarró la
// moneda"). El que emite no sabe quién escucha.
//
//   const off = events.on('moneda', (valor) => puntos += valor);
//   events.emit('moneda', 10);
//
// Un oyente que falla no corta a los demás: el error sale en la consola. Lo que se agrega o se
// saca durante un emit vale desde el emit siguiente.
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { EVENTS_MEMBERS } from './members.js';

/** @typedef {(...args: any[]) => void} Listener */

/** @param {unknown} name @param {string} que */
function nombre(name, que) {
  if (typeof name !== 'string' || !name) throw new TypeError(`${que}(name, …): va el nombre del evento (un texto)`);
  return name;
}
/** @param {unknown} fn @param {string} que @returns {Listener} */
function oyente(fn, que) {
  if (typeof fn !== 'function') throw new TypeError(`${que}(name, fn): va una función`);
  return /** @type {Listener} */ (fn);
}

/** Un bus de eventos. */
export function createEvents() {
  /** Por nombre, los oyentes (con su envoltorio de once). @type {Map<string, Map<Listener, Listener>>} */
  const oyentes = new Map();
  /** @param {string} n @param {Listener} fn @param {Listener} real */
  function agregar(n, fn, real) {
    let m = oyentes.get(n);
    if (!m) oyentes.set(n, (m = new Map()));
    m.set(fn, real);
    return () => { quitar(n, fn); };
  }
  /** @param {string} n @param {Listener} fn */
  function quitar(n, fn) {
    const m = oyentes.get(n);
    if (!m) return false;
    const ok = m.delete(fn);
    if (!m.size) oyentes.delete(n);
    return ok;
  }

  const events = {
    /** Escuchar un evento; devuelve cómo dejar de escucharlo. @param {string} name @param {Listener} fn */
    on(name, fn) { const n = nombre(name, 'on'); const f = oyente(fn, 'on'); return agregar(n, f, f); },
    /** Escuchar solo la próxima vez; devuelve cómo sacarlo antes. @param {string} name @param {Listener} fn */
    once(name, fn) {
      const n = nombre(name, 'once'), f = oyente(fn, 'once');
      return agregar(n, f, (...args) => { quitar(n, f); f(...args); });
    },
    /** Dejar de escuchar: un oyente, o todos los de ese evento sin fn. Devuelve si sacó algo. @param {string} name @param {Listener} [fn] */
    off(name, fn) {
      const n = nombre(name, 'off');
      if (fn === undefined) return oyentes.delete(n);
      return quitar(n, fn);
    },
    /** Avisar: corre los oyentes de ese evento con los argumentos. Devuelve cuántos corrieron. @param {string} name @param {...any} args */
    emit(name, ...args) {
      const n = nombre(name, 'emit');
      const m = oyentes.get(n);
      if (!m) return 0;
      let corridos = 0;
      for (const [fn, real] of [...m]) {
        if (!m.has(fn)) continue; // lo sacó un oyente anterior de este mismo emit
        try { real(...args); } catch (err) { console.error(`events: un oyente de '${n}' falló`, err); }
        corridos++;
      }
      return corridos;
    },
    /** Cuántos oyentes tiene un evento. @param {string} name */
    count(name) { return oyentes.get(nombre(name, 'count'))?.size ?? 0; },
    /** Saca todos los oyentes de todos los eventos. */
    clear() { oyentes.clear(); },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Events — el bus de eventos', EVENTS_MEMBERS, o); },
  };
  return events;
}
