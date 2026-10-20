// Las pruebas de las entidades, los estados, los eventos y los temporizadores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, isData, createStates, createEvents, createTimers } from '../src/index.js';

// ---------- entidades ----------

test('add devuelve el mismo objeto con su id; remove lo saca de todo', () => {
  const world = createWorld();
  const obj = { position: [0, 0, 0], velocity: [1, 0, 0] };
  const e = world.add(obj);
  assert.equal(e, obj);
  assert.equal(e.id, 1);
  assert.equal(world.get(1), e);
  assert.equal(world.add({ vida: 3 }).id, 2);
  assert.equal(world.remove(e), true);
  assert.equal(world.remove(e), false);
  assert.equal(world.has(e), false);
  assert.deepEqual(world.query('position'), []);
  assert.throws(() => world.add({ id: 2 }), /ya hay una entidad con id 2/);
  assert.throws(() => world.add([1]), /objeto plano/);
});

test('query: las que tienen todos los componentes, en orden de llegada, con los índices al día', () => {
  const world = createWorld();
  const a = world.add({ position: [0, 0, 0], velocity: [1, 0, 0] });
  const b = world.add({ position: [0, 0, 0] });
  const c = world.add({ position: [0, 0, 0], velocity: [0, 1, 0], vida: 1 });
  assert.deepEqual(world.query('position', 'velocity'), [a, c]);
  assert.equal(world.query('velocity', 'position'), world.query('position', 'velocity'), 'la misma consulta, el mismo array');
  world.set(b, 'velocity', [0, 0, 1]);
  assert.deepEqual(world.query('position', 'velocity'), [a, c, b]);
  world.unset(a, 'velocity');
  assert.deepEqual(world.query('position', 'velocity'), [c, b]);
  assert.deepEqual(world.query('vida'), [c]);
  assert.deepEqual(world.query('nada'), []);
  assert.throws(() => world.query(), /al menos un componente/);
  assert.throws(() => world.query('id'), /no es un componente/);
});

test('query: agregar y sacar mientras se recorre es seguro (el array no cambia)', () => {
  const world = createWorld();
  for (let i = 0; i < 5; i++) world.add({ bala: i });
  const vistos = [];
  for (const e of world.query('bala')) {
    vistos.push(e.bala);
    world.remove(e);
    world.add({ bala: 100 + e.bala });
  }
  assert.deepEqual(vistos, [0, 1, 2, 3, 4]);
  assert.deepEqual(world.query('bala').map((e) => e.bala), [100, 101, 102, 103, 104]);
  assert.ok(Object.isFrozen(world.query('bala')));
});

test('query con miles de entidades: rápido (la consulta armada no recorre todo)', () => {
  const world = createWorld();
  for (let i = 0; i < 20000; i++) world.add(i % 100 ? { position: [i, 0, 0] } : { position: [i, 0, 0], jefe: true });
  const t0 = performance.now();
  let n = 0;
  for (let k = 0; k < 1000; k++) n += world.query('jefe', 'position').length;
  assert.equal(n, 200 * 1000);
  assert.ok(performance.now() - t0 < 200, 'mil consultas de 200 entre 20000');
});

test('nombres y etiquetas', () => {
  const world = createWorld();
  const h = world.add({ name: 'heroe', tags: ['jugador', 'vivo', 'vivo'] });
  const m1 = world.add({ name: 'moneda', tags: ['item'] });
  const m2 = world.add({ name: 'moneda' });
  assert.deepEqual(h.tags, ['jugador', 'vivo']);
  assert.equal(world.byName('heroe'), h);
  assert.deepEqual(world.named('moneda'), [m1, m2]);
  world.tag(m2, 'item');
  assert.deepEqual(world.tagged('item'), [m1, m2]);
  world.untag(m1, 'item');
  assert.deepEqual(world.tagged('item'), [m2]);
  world.remove(h);
  assert.equal(world.byName('heroe'), undefined);
  assert.deepEqual(world.tagged('jugador'), []);
  assert.throws(() => world.add({ name: '' }), /name va un texto/);
  assert.throws(() => world.add({ tags: 'enemigo' }), /tags: va una lista/);
});

test('sistemas: por fase y por orden; con el mismo orden, el que llegó primero', () => {
  const world = createWorld();
  const log = [];
  world.system('b', () => log.push('b'), { order: 10 });
  world.system('a', () => log.push('a'), { order: 10 });
  world.system('primero', () => log.push('primero'), { order: -Infinity });
  world.system('dibujo', (dt, alpha, w) => log.push(`dibujo ${alpha} ${w === world}`), { phase: 'update' });
  const sacar = world.system('fisica', (dt, w) => log.push(`fisica ${dt} ${w === world}`));
  world.fixed(0.5);
  world.update(0.1, 0.25);
  assert.deepEqual(log, ['primero', 'fisica 0.5 true', 'b', 'a', 'dibujo 0.25 true']);
  sacar();
  assert.deepEqual(world.systems.map((s) => s.name), ['primero', 'dibujo', 'b', 'a']);
  assert.throws(() => world.system('a', () => {}), /ya hay un sistema 'a'/);
  assert.throws(() => world.system('c', () => {}, { orden: 1 }), /clave desconocida: orden/);
  assert.throws(() => world.system('c', () => {}, { phase: 'render' }), /phase/);
});

test('un sistema puede sacar otro (o a sí mismo) mientras corren', () => {
  const world = createWorld();
  const log = [];
  let sacarB = () => {};
  world.system('a', () => { log.push('a'); sacarB(); });
  sacarB = world.system('b', () => log.push('b'));
  world.fixed(1);
  assert.deepEqual(log, ['a']);
});

test('isData: lo que se puede guardar con JSON', () => {
  assert.equal(isData({ a: [1, 'x', null, { b: true }] }), true);
  assert.equal(isData(NaN), false);
  assert.equal(isData(() => 1), false);
  assert.equal(isData(new Map()), false);
  assert.equal(isData({ objeto: new (class Malla {})() }), false);
  assert.equal(isData(new Float32Array(3)), false);
});

test('toJSON y fromJSON: guarda los datos, saltea lo que no es datos, y revive lo vuelve a poner', () => {
  const world = createWorld();
  class Malla {}
  world.add({ name: 'heroe', tags: ['jugador'], transform: { position: [1, 2, 3] }, vida: 3, object3d: new Malla(), alPisar: () => {} });
  world.add({ moneda: { valor: 10 } });
  const json = JSON.parse(JSON.stringify(world));
  assert.deepEqual(json, {
    version: 1, nextId: 3,
    entities: [{ id: 1, name: 'heroe', tags: ['jugador'], transform: { position: [1, 2, 3] }, vida: 3 }, { id: 2, moneda: { valor: 10 } }],
  });
  const otro = createWorld();
  otro.add({ basura: true });
  const cargadas = otro.fromJSON(JSON.stringify(json), { revive: (e) => { if (e.name === 'heroe') e.object3d = new Malla(); } });
  assert.equal(cargadas.length, 2);
  assert.ok(otro.byName('heroe').object3d instanceof Malla);
  assert.deepEqual(otro.query('basura'), []);
  assert.equal(otro.get(2).moneda.valor, 10);
  assert.equal(otro.add({}).id, 3, 'los ids siguen después de los cargados');
  assert.throws(() => otro.fromJSON({ entities: [] }), /fromJSON/);
});

test('onAdd y onRemove; clear avisa cada una', () => {
  const world = createWorld();
  const log = [];
  world.onAdd((e) => log.push(`+${e.id}`));
  world.onRemove((e) => log.push(`-${e.id}`));
  world.add({}); world.add({});
  world.clear();
  assert.deepEqual(log, ['+1', '+2', '-1', '-2']);
  assert.equal(world.size, 0);
});

// ---------- estados ----------

test('la pila de estados: enter, exit, pause, resume, y solo corre el de arriba', () => {
  const log = [];
  const estado = (name) => ({
    name,
    enter: (...a) => log.push(`${name}.enter(${a.join(',')})`), exit: () => log.push(`${name}.exit`),
    pause: () => log.push(`${name}.pause`), resume: () => log.push(`${name}.resume`),
    fixed: (dt) => log.push(`${name}.fixed(${dt})`), update: (dt, a) => log.push(`${name}.update(${a})`),
  });
  const states = createStates();
  const menu = estado('menu'), nivel = estado('nivel'), pausa = estado('pausa');
  states.push(menu);
  states.replace(nivel, 1);
  states.push(pausa);
  states.fixed(0.5); states.update(0.1, 0.3);
  assert.equal(states.current, pausa);
  assert.deepEqual(states.stack.map((s) => s.name), ['nivel', 'pausa']);
  assert.equal(states.pop(), pausa);
  states.fixed(0.5);
  states.clear();
  assert.deepEqual(log, [
    'menu.enter()', 'menu.exit', 'nivel.enter(1)', 'nivel.pause', 'pausa.enter()',
    'pausa.fixed(0.5)', 'pausa.update(0.3)', 'pausa.exit', 'nivel.resume', 'nivel.fixed(0.5)', 'nivel.exit',
  ]);
  assert.equal(states.current, null);
  assert.equal(states.pop(), null);
});

test('estados: datos propios sí, un gancho mal escrito no; onChange avisa', () => {
  const states = createStates();
  const cambios = [];
  states.onChange((c) => cambios.push([c.action, c.current?.name ?? null, c.previous?.name ?? null]));
  states.push({ name: 'nivel', puntos: 0, enemigos: [] });
  assert.throws(() => states.push({ entre() {} }), /clave desconocida: entre/);
  assert.throws(() => states.push({ enter: 3 }), /push\.enter: va una función/);
  assert.throws(() => states.push(states.current), /ya está en la pila/);
  states.pop();
  assert.deepEqual(cambios, [['push', 'nivel', null], ['pop', null, 'nivel']]);
});

test('un estado puede cambiar la pila desde su propio paso (el nivel termina y va al game over)', () => {
  const states = createStates();
  const fin = { name: 'fin' };
  const nivel = { name: 'nivel', fixed: () => states.replace(fin) };
  states.push(nivel);
  states.fixed(1);
  assert.equal(states.current, fin);
});

// ---------- eventos ----------

test('eventos: on, once, off, emit; un oyente que falla no corta a los demás', () => {
  const events = createEvents();
  const log = [];
  const off = events.on('moneda', (v) => log.push(`a${v}`));
  events.once('moneda', (v) => log.push(`once${v}`));
  events.on('moneda', () => { throw new Error('roto'); });
  events.on('moneda', (v) => log.push(`b${v}`));
  const errores = [];
  const consola = console.error;
  console.error = (...a) => errores.push(a[0]);
  try {
    assert.equal(events.emit('moneda', 1), 4);
    off();
    assert.equal(events.emit('moneda', 2), 2);
  } finally { console.error = consola; }
  assert.deepEqual(log, ['a1', 'once1', 'b1', 'b2']);
  assert.equal(errores.length, 2);
  assert.match(errores[0], /'moneda'/);
  assert.equal(events.off('moneda'), true);
  assert.equal(events.count('moneda'), 0);
  assert.equal(events.emit('nadie'), 0);
  assert.throws(() => events.on('', () => {}), /nombre del evento/);
});

test('eventos: lo que se agrega durante un emit vale desde el siguiente; lo que se saca, ya', () => {
  const events = createEvents();
  const log = [];
  let sacarB = () => {};
  events.on('x', () => { log.push('a'); events.on('x', () => log.push('nuevo')); sacarB(); });
  sacarB = events.on('x', () => log.push('b'));
  events.emit('x');
  assert.deepEqual(log, ['a']);
});

// ---------- temporizadores ----------

test('after y every, en orden de tiempo, y cancelables', () => {
  const timers = createTimers();
  const log = [];
  timers.after(1, () => log.push('after1'));
  const cancelar = timers.after(0.5, () => log.push('nunca'));
  timers.every(0.4, (n) => log.push(`every${n}`));
  assert.equal(cancelar(), true);
  assert.equal(cancelar(), false);
  timers.update(1.3);
  assert.deepEqual(log, ['every1', 'every2', 'after1', 'every3']);
  assert.equal(timers.size, 1);
  timers.clear();
  assert.equal(timers.size, 0);
});

test('temporizadores deterministas: un update(1) da lo mismo que diez de 0.1', () => {
  const correr = (pasos) => {
    const timers = createTimers();
    const log = [];
    timers.every(0.25, (n) => { log.push(`e${n}@${timers.time}`); if (n === 2) timers.after(0.1, () => log.push(`hijo@${timers.time}`)); });
    timers.after(0.6, () => log.push(`a@${timers.time}`));
    for (const dt of pasos) timers.update(dt);
    return log;
  };
  const uno = correr([1]);
  assert.deepEqual(uno, ['e1@0.25', 'e2@0.5', 'a@0.6', 'hijo@0.6', 'e3@0.75', 'e4@1']);
  assert.deepEqual(correr([0.5, 0.5]), uno);
  assert.deepEqual(correr(Array(4).fill(0.25)), uno);
});

test('temporizadores: sin update no corren (la pausa del juego los frena); errores claros', () => {
  const timers = createTimers();
  let n = 0;
  timers.after(0, () => n++);
  assert.equal(n, 0);
  timers.update(0);
  assert.equal(n, 1);
  assert.throws(() => timers.every(0, () => {}), /mayor que 0/);
  assert.throws(() => timers.after(-1, () => {}), /after/);
  assert.throws(() => timers.update(NaN), /update\(dt\)/);
});
