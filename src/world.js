// Las entidades: liviano, sin dogma de ECS. Una entidad es un objeto plano con sus componentes
// (`position`, `velocity`, `vida`…) y un `id`; los sistemas son funciones que recorren las
// entidades que tienen ciertos componentes.
//
//   const heroe = world.add({ name: 'heroe', tags: ['jugador'], transform: { position: [0, 0, 0] }, velocity: [0, 0, 0] });
//   world.system('mover', (dt) => {
//     for (const e of world.query('transform', 'velocity')) { … }
//   }, { order: 10 });
//   world.fixed(dt);                       // corre los sistemas del paso fijo, en orden
//
// **Componentes.** Cualquier clave del objeto salvo `id`, `name` y `tags`. Para agregar o sacar
// uno después de crearla, `world.set(e, 'veneno', { … })` y `world.unset(e, 'veneno')`: así se
// mantienen los índices. Cambiar el valor de uno que ya está (`e.velocity[0] = 3`) es libre.
//
// **Consultas rápidas.** Cada componente tiene su índice, y cada consulta que se pidió una vez
// queda armada y se mantiene al agregar y sacar. `query()` devuelve un array que no cambia
// después: sacar o agregar entidades mientras se lo recorre es seguro (lo nuevo sale en la
// consulta siguiente).
//
// **Guardar partida.** `toJSON()` guarda los componentes que son datos (números, textos,
// booleanos, null, y arrays u objetos planos de eso). Lo que no es datos — un Object3D, una
// función, una instancia de una clase — no se guarda: al cargar con `fromJSON(json, { revive })`
// la app lo vuelve a poner.
//
// Puro: no importa three ni DOM.
import { help } from './help.js';
import { WORLD_MEMBERS } from './members.js';

/**
 * @typedef {Record<string, any> & { id: number, name?: string, tags?: string[] }} Entity
 * @typedef {'fixed' | 'update'} Phase
 * @typedef {{ name: string, fn: Function, order: number, phase: Phase, n: number }} System
 * @typedef {{ comps: string[], set: Set<Entity>, list: readonly Entity[] | null }} Query
 * @typedef {{ version: 1, nextId: number, entities: Record<string, unknown>[] }} WorldJSON
 */

const RESERVADAS = ['id', 'name', 'tags'];
const plano = (/** @type {unknown} */ v) => {
  if (!v || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/**
 * ¿Es datos (se puede guardar con JSON y volver igual)?
 * @param {unknown} v @param {number} [prof]
 * @returns {boolean}
 */
export function isData(v, prof = 0) {
  if (prof > 64) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isData(x, prof + 1));
  if (plano(v)) return Object.values(/** @type {object} */ (v)).every((x) => isData(x, prof + 1));
  return false;
}

/** @param {unknown} t @param {string} que @returns {string[]} */
function etiquetas(t, que) {
  if (t === undefined) return [];
  if (!Array.isArray(t) || !t.every((x) => typeof x === 'string' && x)) throw new TypeError(`${que}.tags: va una lista de textos`);
  return [...new Set(t)];
}

/** Un mundo de entidades y sistemas. */
export function createWorld() {
  /** @type {Map<number, Entity>} */ const porId = new Map();
  /** Por componente, las entidades que lo tienen. @type {Map<string, Set<Entity>>} */ const indices = new Map();
  /** Por nombre. @type {Map<string, Set<Entity>>} */ const porNombre = new Map();
  /** Por etiqueta. @type {Map<string, Set<Entity>>} */ const porEtiqueta = new Map();
  /** Las consultas armadas, por clave. @type {Map<string, Query>} */ const consultas = new Map();
  /** @type {System[]} */ let sistemas = [];
  let siguiente = 1, contador = 0;
  /** @type {Set<(e: Entity) => void>} */ const alAgregar = new Set();
  /** @type {Set<(e: Entity) => void>} */ const alSacar = new Set();

  /** @param {Map<string, Set<Entity>>} m @param {string} k @param {Entity} e */
  const meter = (m, k, e) => { let s = m.get(k); if (!s) m.set(k, (s = new Set())); s.add(e); };
  /** @param {Map<string, Set<Entity>>} m @param {string} k @param {Entity} e */
  const sacar = (m, k, e) => { const s = m.get(k); if (s) { s.delete(e); if (!s.size) m.delete(k); } };
  /** Los componentes de una entidad. @param {Entity} e */
  const componentes = (e) => Object.keys(e).filter((k) => !RESERVADAS.includes(k));
  /** ¿Tiene todos? @param {Entity} e @param {string[]} cs */
  const tiene = (e, cs) => cs.every((c) => Object.hasOwn(e, c) && !RESERVADAS.includes(c));

  /** Pone o saca la entidad de las consultas armadas que miran ese componente. @param {Entity} e @param {string} [comp] */
  function reconsultar(e, comp) {
    for (const q of consultas.values()) {
      if (comp !== undefined && !q.comps.includes(comp)) continue;
      const va = porId.get(e.id) === e && tiene(e, q.comps);
      if (va && !q.set.has(e)) { q.set.add(e); q.list = null; }
      if (!va && q.set.has(e)) { q.set.delete(e); q.list = null; }
    }
  }
  /** @param {Entity} e */
  function entidad(e) {
    if (!e || typeof e !== 'object' || porId.get(e.id) !== e) throw new Error('esa entidad no está en el mundo');
    return e;
  }
  /** @param {unknown} c @param {string} que */
  function nombreComp(c, que) {
    if (typeof c !== 'string' || !c) throw new TypeError(`${que}: va el nombre de un componente`);
    if (RESERVADAS.includes(c)) throw new Error(`${que}: ${c} no es un componente (id, name y tags son de la entidad)`);
    return c;
  }
  /** @param {Phase} fase @param {any[]} args */
  function correr(fase, args) {
    for (const s of sistemas) {
      if (s.phase !== fase || !sistemas.includes(s)) continue;
      s.fn(...args);
    }
  }

  const world = {
    /**
     * Agrega una entidad: el mismo objeto, con su `id` (si trae uno libre, lo respeta). Devuelve la entidad.
     * @param {Record<string, any>} components
     * @returns {Entity}
     */
    add(components) {
      if (!plano(components)) throw new TypeError('add: va un objeto plano con los componentes { position, velocity, … }');
      const e = /** @type {Entity} */ (components);
      if (e.id !== undefined && porId.get(e.id) === e) throw new Error('add: esa entidad ya está en el mundo');
      if (e.id !== undefined) {
        if (!Number.isInteger(e.id) || e.id < 1) throw new TypeError(`add: id va un entero de 1 en adelante (llegó ${JSON.stringify(e.id)})`);
        if (porId.has(e.id)) throw new Error(`add: ya hay una entidad con id ${e.id}`);
      } else e.id = siguiente;
      siguiente = Math.max(siguiente, e.id + 1);
      if (e.name !== undefined && (typeof e.name !== 'string' || !e.name)) throw new TypeError(`add: name va un texto (llegó ${JSON.stringify(e.name)})`);
      if (e.tags !== undefined) e.tags = etiquetas(e.tags, 'add');
      porId.set(e.id, e);
      for (const c of componentes(e)) meter(indices, c, e);
      if (e.name) meter(porNombre, e.name, e);
      for (const t of e.tags ?? []) meter(porEtiqueta, t, e);
      reconsultar(e);
      for (const fn of [...alAgregar]) fn(e);
      return e;
    },
    /** Saca una entidad del mundo (sigue siendo el mismo objeto). Devuelve si estaba. @param {Entity} entity */
    remove(entity) {
      if (!entity || porId.get(entity.id) !== entity) return false;
      porId.delete(entity.id);
      for (const c of componentes(entity)) sacar(indices, c, entity);
      if (entity.name) sacar(porNombre, entity.name, entity);
      for (const t of entity.tags ?? []) sacar(porEtiqueta, t, entity);
      reconsultar(entity);
      for (const fn of [...alSacar]) fn(entity);
      return true;
    },
    /** ¿Está en el mundo? @param {Entity} entity */
    has(entity) { return !!entity && porId.get(entity.id) === entity; },
    /** La entidad con ese id, o undefined. @param {number} id */
    get(id) { return porId.get(id); },
    /** Agrega o cambia un componente, manteniendo los índices. @param {Entity} entity @param {string} component @param {unknown} value */
    set(entity, component, value) {
      const e = entidad(entity), c = nombreComp(component, 'set');
      if (value === undefined) throw new TypeError(`set(${c}): va un valor (para sacarlo, unset)`);
      const nuevo = !Object.hasOwn(e, c);
      e[c] = value;
      if (nuevo) { meter(indices, c, e); reconsultar(e, c); }
      return e;
    },
    /** Saca un componente, manteniendo los índices. Devuelve si lo tenía. @param {Entity} entity @param {string} component */
    unset(entity, component) {
      const e = entidad(entity), c = nombreComp(component, 'unset');
      if (!Object.hasOwn(e, c)) return false;
      delete e[c];
      sacar(indices, c, e);
      reconsultar(e, c);
      return true;
    },
    /**
     * Las entidades que tienen todos esos componentes, en el orden en que entraron. El array no
     * cambia después (se puede agregar y sacar mientras se recorre).
     * @param {...string} components @returns {readonly Entity[]}
     */
    query(...components) {
      if (!components.length) throw new Error('query: va al menos un componente (todas: world.entities)');
      const cs = components.map((c, i) => nombreComp(c, `query[${i}]`));
      const clave = [...new Set(cs)].sort().join('\u0000');
      let q = consultas.get(clave);
      if (!q) {
        // la primera vez se arma desde el índice más chico
        const [menor] = cs.map((c) => indices.get(c) ?? new Set()).sort((a, b) => a.size - b.size);
        const set = new Set([...porId.values()].filter((e) => menor.has(e) && tiene(e, cs)));
        q = { comps: [...new Set(cs)], set, list: null };
        consultas.set(clave, q);
      }
      const lista = q.list ?? Object.freeze([...q.set]);
      q.list = lista;
      return lista;
    },
    /** La primera entidad con ese nombre, o undefined. @param {string} name */
    byName(name) { const s = porNombre.get(name); return s ? s.values().next().value : undefined; },
    /** Todas las entidades con ese nombre. @param {string} name */
    named(name) { return [...(porNombre.get(name) ?? [])]; },
    /** Las entidades con esa etiqueta. @param {string} tag */
    tagged(tag) { return [...(porEtiqueta.get(tag) ?? [])]; },
    /** Le pone etiquetas. @param {Entity} entity @param {...string} tags */
    tag(entity, ...tags) {
      const e = entidad(entity);
      for (const t of etiquetas(tags, 'tag')) if (!(e.tags ??= []).includes(t)) { e.tags.push(t); meter(porEtiqueta, t, e); }
      return e;
    },
    /** Le saca etiquetas. @param {Entity} entity @param {...string} tags */
    untag(entity, ...tags) {
      const e = entidad(entity);
      for (const t of tags) if (e.tags?.includes(t)) { e.tags = e.tags.filter((x) => x !== t); sacar(porEtiqueta, t, e); }
      return e;
    },
    /** Todas las entidades, en el orden en que entraron (una copia). */
    get entities() { return [...porId.values()]; },
    /** Cuántas entidades hay. */
    get size() { return porId.size; },
    /**
     * Un sistema: una función que corre en cada paso fijo (`phase: 'fixed'`, por defecto:
     * fn(dt, world)) o en cada cuadro (`phase: 'update'`: fn(dt, alpha, world)). Corren de menor
     * a mayor `order`, y con el mismo order, en el orden en que se agregaron. Devuelve cómo sacarlo.
     * @param {string} name @param {Function} fn @param {{ order?: number, phase?: Phase }} [opts]
     */
    system(name, fn, opts = {}) {
      if (typeof name !== 'string' || !name) throw new TypeError('system(name, fn): va un nombre');
      if (typeof fn !== 'function') throw new TypeError(`system(${name}, fn): va una función`);
      for (const k of Object.keys(opts)) if (!['order', 'phase'].includes(k)) throw new Error(`system(${name}): clave desconocida: ${k} (van order, phase)`);
      const order = opts.order ?? 0, phase = opts.phase ?? 'fixed';
      if (typeof order !== 'number' || Number.isNaN(order)) throw new TypeError(`system(${name}).order: va un número`);
      if (phase !== 'fixed' && phase !== 'update') throw new Error(`system(${name}).phase: va 'fixed' o 'update' (llegó ${JSON.stringify(phase)})`);
      if (sistemas.some((s) => s.name === name)) throw new Error(`system: ya hay un sistema '${name}'`);
      const s = { name, fn, order, phase, n: contador++ };
      sistemas = [...sistemas, s].sort((a, b) => (a.order === b.order ? a.n - b.n : a.order < b.order ? -1 : 1));
      return () => { sistemas = sistemas.filter((x) => x !== s); };
    },
    /** Los sistemas, en el orden en que corren: [{ name, phase, order }]. */
    get systems() { return sistemas.map(({ name, phase, order }) => ({ name, phase, order })); },
    /** Corre los sistemas del paso fijo. @param {number} dt */
    fixed(dt) { correr('fixed', [dt, world]); },
    /** Corre los sistemas del cuadro. @param {number} dt @param {number} [alpha] */
    update(dt, alpha = 1) { correr('update', [dt, alpha, world]); },
    /** Algo que corre al agregar una entidad; devuelve cómo sacarlo. @param {(e: Entity) => void} fn */
    onAdd(fn) { alAgregar.add(fn); return () => { alAgregar.delete(fn); }; },
    /** Algo que corre al sacar una entidad; devuelve cómo sacarlo. @param {(e: Entity) => void} fn */
    onRemove(fn) { alSacar.add(fn); return () => { alSacar.delete(fn); }; },
    /** Saca todas las entidades (cada una avisa en onRemove). Los sistemas quedan. */
    clear() { for (const e of [...porId.values()]) world.remove(e); },
    /**
     * Los componentes que son datos, para guardar partida: { version, nextId, entities }. Lo que
     * no es datos (un Object3D, una función, una clase) no va.
     * @returns {WorldJSON}
     */
    toJSON() {
      return {
        version: 1, nextId: siguiente,
        entities: [...porId.values()].map((e) => {
          /** @type {Record<string, unknown>} */ const o = { id: e.id };
          if (e.name) o.name = e.name;
          if (e.tags?.length) o.tags = [...e.tags];
          for (const c of componentes(e)) if (isData(e[c])) o[c] = JSON.parse(JSON.stringify(e[c]));
          return o;
        }),
      };
    },
    /**
     * Carga lo que guardó toJSON: saca todas las entidades y agrega las guardadas, con sus ids.
     * `revive(e)` corre con cada una antes de agregarla, para volver a poner lo que no es datos.
     * @param {WorldJSON | string} json @param {{ revive?: (e: Record<string, any>) => void }} [opts]
     */
    fromJSON(json, { revive } = {}) {
      const d = typeof json === 'string' ? JSON.parse(json) : json;
      if (!plano(d) || d.version !== 1 || !Array.isArray(d.entities)) throw new Error('fromJSON: va lo que devuelve toJSON() ({ version: 1, nextId, entities })');
      const nuevas = d.entities.map((/** @type {unknown} */ x, /** @type {number} */ i) => {
        if (!plano(x) || !Number.isInteger(/** @type {any} */ (x).id)) throw new Error(`fromJSON: entities[${i}] va una entidad con id`);
        return /** @type {Record<string, any>} */ (JSON.parse(JSON.stringify(x)));
      });
      world.clear();
      for (const e of nuevas) { revive?.(e); world.add(e); }
      siguiente = Math.max(siguiente, Number.isInteger(d.nextId) ? d.nextId : 1);
      return world.entities;
    },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('World — entidades y sistemas', WORLD_MEMBERS, o); },
  };
  return world;
}
