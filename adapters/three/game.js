// El juego sobre three.js: junta las piezas puras (loop, entrada, estados, entidades, eventos,
// temporizadores, cámara) y las engancha a un motor que la app ya creó — threejs-render-engine,
// o cualquier objeto con `onFrame(fn)` y `view.set(estado)` —, sin importarlo.
//
//   import { createEngine } from 'threejs-render-engine';
//   import { createGame } from 'threejs-game-engine/three';
//
//   const motor = createEngine(document.body);
//   const juego = createGame({ engine: motor, bindings: { saltar: ['Space', 'pad:a'] } });
//   const heroe = juego.world.add({ object3d: malla, transform: { position: [0, 0, 0] } });
//   juego.camera.follow(heroe, { mode: 'behind' });
//   juego.start();
//
// Cada cuadro (engine.onFrame):
//   1. lee los gamepads (Gamepad API) y se los pasa a la entrada;
//   2. loop.advance(dt): en cada paso fijo, input.beginStep → guarda el transform anterior de
//      cada entidad → states.fixed → world.fixed → timers.update → los game.loop.onFixed de la app;
//   3. una vez: input.endStep → states.update → world.update → copia el transform a su object3d,
//      interpolado con alpha → la cámara (view.set) → los game.loop.onUpdate de la app;
//   4. input.endFrame.
//
// Duck typing con los otros motores de la suite: un componente `object3d` puede ser un
// THREE.Object3D o algo con `.object` (un sprite de threejs-sprite-engine, un emisor de
// threejs-particle-engine). Si tiene un `facing` numérico (un sprite), la guiñada del transform va
// ahí y el objeto no se gira (el sprite se orienta solo hacia la cámara).
import * as THREE from 'three';
import { createLoop } from '../../src/loop.js';
import { createInput, readGamepads } from '../../src/input.js';
import { createStates } from '../../src/states.js';
import { createWorld } from '../../src/world.js';
import { createEvents } from '../../src/events.js';
import { createTimers } from '../../src/timers.js';
import { followCamera } from '../../src/camera.js';
import { checkTransform, lerpAngle } from '../../src/transform.js';
import { help } from '../../src/help.js';
import { GAME_MEMBERS } from '../../src/members.js';

/** @typedef {[number, number, number]} Vec3 */

const OPCIONES = ['engine', 'step', 'maxSteps', 'timeScale', 'bindings', 'target', 'gamepad', 'preventDefault'];
const CODIGO_TECLA = /^[A-Z][A-Za-z0-9]+$/;

/** El Object3D de un componente: el mismo, o su `.object` (un sprite, un emisor). @param {any} c */
const objetoDe = (c) => (c?.isObject3D ? c : c?.object?.isObject3D ? c.object : null);

/** ¿Un campo de texto, donde las teclas son del usuario y no del juego? @param {any} t */
const editable = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? ''));

/** La posición del objeto en el mundo. @param {any} o @returns {Vec3} */
function posicionMundo(o) {
  o.updateWorldMatrix(true, false);
  const e = o.matrixWorld.elements;
  return [e[12], e[13], e[14]];
}
/** Hacia dónde mira el objeto en el mundo (la guiñada de su +z local). @param {any} o */
function rumboMundo(o) {
  o.updateWorldMatrix(true, false);
  const e = o.matrixWorld.elements;
  return Math.atan2(e[8], e[10]);
}

/**
 * El juego.
 * @param {{ engine: any, step?: number, maxSteps?: number, timeScale?: number, bindings?: Record<string, unknown>, target?: any, gamepad?: boolean | (() => ArrayLike<any>), preventDefault?: boolean }} opts
 */
export function createGame(opts) {
  if (!opts || typeof opts !== 'object') throw new TypeError('createGame: va { engine, step?, bindings?, target? }');
  for (const k of Object.keys(opts)) if (!OPCIONES.includes(k)) throw new Error(`createGame: clave desconocida: ${k} (van ${OPCIONES.join(', ')})`);
  const engine = opts.engine;
  if (!engine || typeof engine.onFrame !== 'function') throw new TypeError('createGame: engine va un motor ya creado (threejs-render-engine, o un objeto con onFrame(fn) y view.set(estado))');

  const loop = createLoop({ step: opts.step ?? 1 / 60, maxSteps: opts.maxSteps ?? 5, timeScale: opts.timeScale ?? 1 });
  const input = createInput(opts.bindings ?? {});
  const states = createStates();
  const world = createWorld();
  const events = createEvents();
  const timers = createTimers();
  const evitarDefecto = opts.preventDefault ?? true;
  const gp = opts.gamepad ?? true;
  /** @type {(() => ArrayLike<any>) | null} */
  const leerPads = typeof gp === 'function' ? gp : gp ? () => globalThis.navigator?.getGamepads?.() ?? [] : null;

  // ---------- entidades con object3d y transform ----------
  /** El transform del paso anterior, por entidad. @type {WeakMap<object, { position?: Vec3, rotation?: Vec3, scale?: Vec3 }>} */
  const anteriores = new WeakMap();
  /** Los objetos que colgó el juego en engine.content (los descuelga al sacar la entidad). @type {WeakSet<object>} */
  const colgados = new WeakSet();
  /** Los objetos que ya vio (se cuelgan una sola vez: si la app los saca, quedan afuera). @type {WeakSet<object>} */
  const vistos = new WeakSet();

  /** @param {any} obj */
  function colgar(obj) {
    if (vistos.has(obj)) return;
    vistos.add(obj);
    if (!obj.parent && engine.content && typeof engine.content.add === 'function') { engine.content.add(obj); colgados.add(obj); }
  }
  /** Copia los valores sin crear arrays nuevos. @param {any} e */
  function guardarAnterior(e) {
    const t = e.transform, p = anteriores.get(e) ?? {};
    for (const k of /** @type {const} */ (['position', 'rotation', 'scale'])) {
      const v = t[k];
      if (!v) { delete p[k]; continue; }
      const a = (p[k] ??= /** @type {Vec3} */ ([0, 0, 0]));
      a[0] = v[0]; a[1] = v[1]; a[2] = v[2];
    }
    anteriores.set(e, p);
  }
  /** Copia el transform al objeto, interpolado entre el paso anterior y el actual. @param {any} e @param {number} alpha */
  function dibujar(e, alpha) {
    const c = e.object3d, obj = objetoDe(c);
    if (!obj) return;
    colgar(obj);
    const t = e.transform, p = anteriores.get(e) ?? t, a = Math.min(1, Math.max(0, alpha));
    if (t.position) { const q = p.position ?? t.position; obj.position.set(q[0] + (t.position[0] - q[0]) * a, q[1] + (t.position[1] - q[1]) * a, q[2] + (t.position[2] - q[2]) * a); }
    if (t.rotation) {
      const q = p.rotation ?? t.rotation;
      const r = [0, 1, 2].map((i) => lerpAngle(q[i], t.rotation[i], a));
      // un sprite mira solo a la cámara: la guiñada del transform es su facing
      if (c !== obj && typeof c.facing === 'number') c.facing = r[1];
      else obj.rotation.set(r[0], r[1], r[2]);
    }
    if (t.scale) { const q = p.scale ?? t.scale; obj.scale.set(q[0] + (t.scale[0] - q[0]) * a, q[1] + (t.scale[1] - q[1]) * a, q[2] + (t.scale[2] - q[2]) * a); }
  }
  world.onAdd((e) => {
    try {
      if (e.transform !== undefined) checkTransform(e.transform, `entidad ${e.id}: transform`);
      if (e.object3d !== undefined && !objetoDe(e.object3d)) throw new TypeError(`entidad ${e.id}: object3d va un THREE.Object3D o algo con .object (un sprite, un emisor)`);
    } catch (err) { world.remove(e); throw err; }
    if (e.object3d) { colgar(objetoDe(e.object3d)); if (e.transform) dibujar(e, 1); }
  });
  world.onRemove((e) => {
    anteriores.delete(e);
    const obj = objetoDe(e.object3d);
    if (obj && colgados.has(obj)) { obj.removeFromParent(); colgados.delete(obj); vistos.delete(obj); }
    if (seguido === e) camera.release();
  });

  // ---------- el paso fijo y el cuadro ----------
  // Los oyentes del juego son los primeros del loop: lo que la app agrega con game.loop.onFixed y
  // onUpdate corre después, adentro del mismo paso y del mismo cuadro (y ve los mismos flancos).
  // Por eso el paso se cierra solo (el beginStep siguiente, o el endStep al empezar el cuadro) y el
  // cuadro se cierra después de loop.advance.
  loop.onFixed((dt) => {
    input.beginStep();
    for (const e of world.query('transform')) guardarAnterior(e);
    states.fixed(dt);
    world.fixed(dt);
    timers.update(dt);
  });
  loop.onUpdate((dt, alpha) => {
    input.endStep();
    states.update(dt, alpha);
    world.update(dt, alpha);
    for (const e of world.query('object3d', 'transform')) dibujar(e, alpha);
    if (rig && leer) engine.view.set(rig.update(leer(), dt));
  });
  let pasos = 0;
  /** @param {number} dt */
  function cuadro(dt) {
    if (!andando) return; // un motor cuyo onFrame no devuelve cómo sacarlo
    if (leerPads) {
      let pads = null;
      try { pads = leerPads(); } catch { /* el navegador no deja leerlos (contexto inseguro, permisos) */ }
      input.pad(readGamepads(pads));
    }
    try { pasos = loop.advance(dt); } finally { input.endStep(); input.endFrame(); }
  }

  // ---------- la entrada del DOM ----------
  const destino = opts.target ?? globalThis.window ?? null;
  const ventana = globalThis.window && globalThis.window !== destino ? globalThis.window : null;
  /** Los códigos que usa alguna acción (para no frenar el comportamiento de las teclas que no son del juego). */
  function atados() {
    const s = new Set();
    for (const b of Object.values(input.bindings())) {
      if (Array.isArray(b)) b.forEach((c) => s.add(c));
      else for (const l of Object.values(b.keys)) l.forEach((c) => s.add(c));
    }
    return s;
  }
  /** @param {any} e */
  function alBajarTecla(e) {
    if (e.repeat || editable(e.target) || typeof e.code !== 'string' || !CODIGO_TECLA.test(e.code)) return;
    input.press(e.code);
    if (evitarDefecto && atados().has(e.code)) e.preventDefault?.();
  }
  /** @param {any} e */
  function alSoltarTecla(e) { if (typeof e.code === 'string' && CODIGO_TECLA.test(e.code)) input.release(e.code); }
  /** @param {any} e */
  function alBajarMouse(e) { if (Number.isInteger(e.button) && e.button >= 0 && e.button <= 4 && !editable(e.target)) input.press(`mouse:${e.button}`); }
  /** @param {any} e */
  function alSoltarMouse(e) { if (Number.isInteger(e.button) && e.button >= 0 && e.button <= 4) input.release(`mouse:${e.button}`); }
  /** @param {any} e */
  function alMenu(e) { if (evitarDefecto && atados().has('mouse:2')) e.preventDefault?.(); }
  function alPerderFoco() { input.releaseAll(); }
  /** @type {[any, string, (e: any) => void][]} */
  const oyentes = [
    [destino, 'keydown', alBajarTecla], [destino, 'keyup', alSoltarTecla],
    [destino, 'mousedown', alBajarMouse], [destino, 'mouseup', alSoltarMouse], [destino, 'contextmenu', alMenu],
    [destino, 'blur', alPerderFoco], [ventana, 'blur', alPerderFoco],
  ];
  /** El gesto del mouse es del juego si su botón es de una acción: la órbita del motor no lo toma. @param {any} e */
  const reclamo = (e) => (e.type === 'pointerdown' && e.pointerType !== 'touch' && atados().has(`mouse:${e.button}`) ? 'app' : undefined);

  // ---------- la cámara ----------
  /** @type {any} */ let seguido = null;
  /** @type {ReturnType<typeof followCamera> | null} */ let rig = null;
  /** @type {(() => { position: Vec3, heading?: number }) | null} */ let leer = null;
  /** @type {(() => void) | null} */ let soltarVista = null;

  /** Cómo leer la posición y el rumbo de lo que se sigue. @param {any} s */
  function lectorDe(s) {
    if (typeof s === 'function') return s;
    if (s && typeof s === 'object' && 'transform' in s && !s.isObject3D) {
      return () => {
        const obj = objetoDe(s.object3d), t = s.transform;
        const heading = t.rotation ? t.rotation[1] : obj ? rumboMundo(obj) : undefined;
        return { position: obj ? posicionMundo(obj) : /** @type {Vec3} */ ([...t.position ?? [0, 0, 0]]), heading };
      };
    }
    const obj = objetoDe(s);
    if (!obj) throw new TypeError('camera.follow(subject): va una entidad (con transform u object3d), un Object3D, algo con .object (un sprite) o una función → { position, heading }');
    return () => ({ position: posicionMundo(obj), heading: s !== obj && typeof s.facing === 'number' ? s.facing : rumboMundo(obj) });
  }
  /**
   * Un rayo contra la escena: a qué distancia choca, sin contar lo que se sigue, lo invisible,
   * lo que no es una malla ni lo marcado con userData.noCollide.
   * @param {any[] | null} raices @param {any} sujeto
   */
  function choqueContra(raices, sujeto) {
    const rayo = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
    const propio = typeof sujeto === 'function' ? null : objetoDe(sujeto?.object3d) ?? objetoDe(sujeto);
    /** @param {any} x */
    const cuenta = (x) => {
      if (!x.isMesh || x.userData.noCollide) return false;
      for (let p = x; p; p = p.parent) if (!p.visible || p === propio) return false;
      return true;
    };
    return (/** @type {Vec3} */ desde, /** @type {Vec3} */ hasta) => {
      o.fromArray(desde);
      d.fromArray(hasta).sub(o);
      const largo = d.length();
      if (!(largo > 0)) return null;
      rayo.set(o, d.divideScalar(largo));
      rayo.far = largo;
      const r = raices ?? (engine.content ? [engine.content] : []);
      // el rayo usa matrixWorld, que three pone al día recién al dibujar: lo recién movido llegaría tarde
      for (const x of r) x.updateMatrixWorld?.();
      const hit = rayo.intersectObjects(r, true).find((h) => cuenta(h.object));
      // un poco antes de la pared, para que el plano cercano no la corte
      return hit ? Math.max(0, hit.distance - largo * 0.05) : null;
    };
  }

  const camera = {
    /**
     * Toma la cámara (view.suspend('game')) y sigue a `subject` en cada cuadro con view.set.
     * opts: los de followCamera (mode, offset, look, lookAhead, damping…) y collide: true (choca
     * con engine.content), una lista de objetos, o una función propia. Devuelve la followCamera.
     * @param {any} subject @param {Record<string, any>} [o]
     */
    follow(subject, o = {}) {
      const view = engine.view;
      if (!view || typeof view.set !== 'function') throw new TypeError('camera.follow: el motor no tiene view.set (hace falta un motor como threejs-render-engine)');
      const { collide, ...resto } = o;
      let choque = null;
      if (collide === true) choque = choqueContra(null, subject);
      else if (Array.isArray(collide)) choque = choqueContra(collide, subject);
      else if (typeof collide === 'function') choque = collide;
      else if (collide !== undefined && collide !== false && collide !== null) throw new TypeError('camera.follow: collide va true, una lista de objetos o una función (desde, hasta) => distancia | null');
      const nuevoLector = lectorDe(subject);
      const nuevo = followCamera({ ...resto, collide: choque });
      rig = nuevo; leer = nuevoLector; seguido = subject;
      if (!soltarVista && typeof view.suspend === 'function') soltarVista = view.suspend('game');
      view.set(nuevo.update(nuevoLector(), 0));
      return nuevo;
    },
    /** Devuelve la cámara al motor: la órbita del usuario vuelve, la cámara queda donde está. */
    release() {
      soltarVista?.();
      soltarVista = null; rig = null; leer = null; seguido = null;
    },
    /** Lo que sigue, o null. */
    get following() { return seguido; },
    /** La followCamera en uso, o null. */
    get rig() { return rig; },
  };

  let andando = false;
  /** @type {(() => void) | null} */ let quitarCuadro = null;
  /** @type {(() => void) | null} */ let quitarReclamo = null;

  const game = {
    engine,
    loop,
    input,
    states,
    world,
    events,
    timers,
    camera,
    /** Se engancha a engine.onFrame y a la entrada del DOM: el juego anda. */
    start() {
      if (andando) return game;
      andando = true;
      const q = engine.onFrame(cuadro);
      quitarCuadro = typeof q === 'function' ? q : null;
      for (const [t, tipo, fn] of oyentes) t?.addEventListener?.(tipo, fn);
      if (typeof engine.view?.claim === 'function') quitarReclamo = engine.view.claim(reclamo);
      return game;
    },
    /** Frena el tiempo del juego: no corren pasos fijos ni temporizadores (lo que corre por cuadro sigue, con dt 0). */
    pause() { loop.pause(); return game; },
    /** Vuelve a andar. */
    resume() { loop.resume(); return game; },
    /** ¿Está andando? */
    get running() { return andando; },
    /** Dibuja el transform tal cual, sin interpolar desde donde estaba (un teletransporte). @param {any} entity */
    snap(entity) {
      if (!world.has(entity) || !entity.transform) throw new Error('snap(entity): va una entidad del mundo con transform');
      guardarAnterior(entity);
      dibujar(entity, 1);
      if (seguido === entity) rig?.reset();
      return entity;
    },
    /** Cómo anda: el tiempo, el paso, cuántos pasos corrió el último cuadro y cuántos se descartaron. */
    stats() {
      return { time: loop.time, frame: loop.frame, steps: pasos, dropped: loop.dropped, entities: world.size, systems: world.systems.length, state: states.current?.name ?? null };
    },
    /** Suelta todo: el cuadro, la entrada, la cámara, los estados (exit), las entidades y los temporizadores. */
    dispose() {
      quitarCuadro?.(); quitarCuadro = null;
      quitarReclamo?.(); quitarReclamo = null;
      if (andando) for (const [t, tipo, fn] of oyentes) t?.removeEventListener?.(tipo, fn);
      andando = false;
      camera.release();
      states.clear();
      world.clear();
      timers.clear();
      events.clear();
      input.releaseAll();
    },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Game — lo que hace falta para un juego', GAME_MEMBERS, o); },
  };
  return game;
}
