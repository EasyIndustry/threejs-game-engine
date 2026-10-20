// El loop de paso fijo: la lógica del juego corre a un ritmo fijo (60 pasos por segundo, por
// defecto) aunque la pantalla dibuje a 30, 60 o 144 cuadros. Así la física y las reglas dan lo
// mismo en cualquier máquina, y lo que se dibuja se interpola entre los dos últimos pasos.
//
//   const loop = createLoop({ step: 1 / 60 });
//   loop.onFixed((dt) => fisica(dt));                 // 0, 1 o varias veces por cuadro
//   loop.onUpdate((dt, alpha) => dibujar(alpha));     // una vez por cuadro
//   motor.onFrame((dt) => loop.advance(dt));          // dt real, en segundos
//
// `advance(dt)` acumula el tiempo y corre los pasos fijos que entren. Si la máquina no da abasto
// (o la pestaña estuvo oculta y llega un dt enorme), corre a lo sumo `maxSteps` y descarta el
// resto: el juego va más lento por un momento en vez de entrar en la espiral de la muerte (cada
// cuadro tarda más porque tiene que ponerse al día, y por eso tiene que ponerse más al día).
//
// `alpha` (de 0 a 1) dice cuánto del paso siguiente ya pasó: lo dibujado es
// `anterior + (actual − anterior) · alpha`.
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { LOOP_MEMBERS } from './members.js';

/**
 * @typedef {(dt: number) => void} FixedFn
 * @typedef {(dt: number, alpha: number, realDt: number) => void} UpdateFn
 * @typedef {{ step?: number, maxSteps?: number, timeScale?: number, onFixed?: FixedFn, onUpdate?: UpdateFn }} LoopOptions
 */

/** @param {unknown} v @param {string} que */
function positivo(v, que) {
  if (typeof v !== 'number' || !Number.isFinite(v) || !(v > 0)) throw new RangeError(`${que}: va un número mayor que 0 (llegó ${JSON.stringify(v)})`);
  return v;
}

/** @param {unknown} v */
function escala(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`timeScale: va un número de 0 en adelante (llegó ${JSON.stringify(v)})`);
  return v;
}

/**
 * El loop de paso fijo.
 * @param {LoopOptions} [opts]
 */
export function createLoop(opts = {}) {
  if (!opts || typeof opts !== 'object') throw new TypeError('createLoop: va un objeto { step, maxSteps, timeScale, onFixed, onUpdate }');
  const conocidas = ['step', 'maxSteps', 'timeScale', 'onFixed', 'onUpdate'];
  for (const k of Object.keys(opts)) if (!conocidas.includes(k)) throw new Error(`createLoop: clave desconocida: ${k} (van ${conocidas.join(', ')})`);
  const paso = positivo(opts.step ?? 1 / 60, 'step');
  const tope = opts.maxSteps ?? 5;
  if (!Number.isInteger(tope) || tope < 1) throw new RangeError(`maxSteps: va un entero de 1 en adelante (llegó ${JSON.stringify(tope)})`);
  let velocidad = escala(opts.timeScale ?? 1);
  // un margen para que 1/60 + 1/60 + 1/60 (que en coma flotante no da justo 3/60) cuente 3 pasos
  const casi = paso * 1e-6;

  /** @type {Set<FixedFn>} */ const fijos = new Set();
  /** @type {Set<UpdateFn>} */ const cuadros = new Set();
  if (opts.onFixed) fijos.add(funcion(opts.onFixed, 'onFixed'));
  if (opts.onUpdate) cuadros.add(funcion(opts.onUpdate, 'onUpdate'));

  let acumulado = 0, tiempo = 0, numero = 0, descartados = 0, pausado = false;

  /** @param {unknown} fn @param {string} que @returns {any} */
  function funcion(fn, que) {
    if (typeof fn !== 'function') throw new TypeError(`${que}(fn): va una función`);
    return fn;
  }
  function correrPaso() {
    for (const fn of [...fijos]) fn(paso);
    tiempo += paso;
    numero++;
  }
  const fraccion = () => Math.min(1, Math.max(0, acumulado / paso));

  const loop = {
    /**
     * Avanza el tiempo real `dt` (segundos): corre los pasos fijos que entren (a lo sumo
     * maxSteps) y después onUpdate una vez. Devuelve cuántos pasos fijos corrió.
     * @param {number} dt
     */
    advance(dt) {
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new RangeError(`advance(dt): va el tiempo real del cuadro en segundos, 0 o más (llegó ${dt})`);
      let n = 0;
      const juego = pausado ? 0 : dt * velocidad;
      if (!pausado) {
        acumulado += juego;
        while (acumulado + casi >= paso && n < tope) { correrPaso(); acumulado -= paso; n++; }
        if (acumulado + casi >= paso) {
          // no da abasto: se descarta lo que sobra (pasos enteros), sin tocar la fracción
          const sobra = Math.floor((acumulado + casi) / paso);
          descartados += sobra;
          acumulado -= sobra * paso;
        }
        if (acumulado < 0) acumulado = 0;
      }
      const a = fraccion();
      for (const fn of [...cuadros]) fn(juego, a, dt);
      return n;
    },
    /** Un solo paso fijo, aunque esté en pausa (para depurar cuadro a cuadro), y después onUpdate. */
    stepOnce() {
      correrPaso();
      const a = fraccion();
      for (const fn of [...cuadros]) fn(paso, a, 0);
    },
    /** Frena el tiempo del juego: advance no corre pasos fijos (onUpdate sigue, con dt 0). */
    pause() { pausado = true; },
    /** Lo vuelve a andar, sin ponerse al día con lo que estuvo en pausa. */
    resume() { pausado = false; },
    /** ¿Está en pausa? */
    get paused() { return pausado; },
    /** Cuánto dura un paso fijo, en segundos de juego. */
    get step() { return paso; },
    /** Cuántos pasos fijos corre a lo sumo por cuadro. */
    get maxSteps() { return tope; },
    /** La velocidad del tiempo del juego: 1 normal, 0.5 cámara lenta, 0 congelado. */
    get timeScale() { return velocidad; },
    set timeScale(v) { velocidad = escala(v); },
    /** El tiempo del juego en segundos: la suma de los pasos fijos que corrieron. */
    get time() { return tiempo; },
    /** El número de paso fijo: cuántos corrieron desde el principio (o desde reset). */
    get frame() { return numero; },
    /** Cuánto del paso siguiente ya pasó (0 a 1): para interpolar lo que se dibuja. */
    get alpha() { return fraccion(); },
    /** Cuántos pasos se descartaron porque la máquina no daba abasto (o volvió de una pestaña oculta). */
    get dropped() { return descartados; },
    /** Algo que corre en cada paso fijo, con el dt del paso; devuelve cómo sacarlo. @param {FixedFn} fn */
    onFixed(fn) { fijos.add(funcion(fn, 'onFixed')); return () => { fijos.delete(fn); }; },
    /** Algo que corre una vez por cuadro, después de los pasos fijos: (dt, alpha, dtReal); devuelve cómo sacarlo. @param {UpdateFn} fn */
    onUpdate(fn) { cuadros.add(funcion(fn, 'onUpdate')); return () => { cuadros.delete(fn); }; },
    /** Vuelve el tiempo, el número de paso y lo acumulado a cero (no saca los oyentes). */
    reset() { acumulado = 0; tiempo = 0; numero = 0; descartados = 0; },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Loop — el paso fijo', LOOP_MEMBERS, o); },
  };
  return loop;
}
