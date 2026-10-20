// Las pruebas del contrato: lo puro no importa three ni el DOM, ningún motor importa a otro
// motor de la suite, y cada tabla de help() coincide con la API de su objeto (leyendo el fuente,
// en las dos direcciones). El adaptador no se carga (necesita three): se lee como texto. Lo que
// dibuja se prueba en un navegador (examples/index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  LOOP_MEMBERS, INPUT_MEMBERS, STATES_MEMBERS, EVENTS_MEMBERS, TIMERS_MEMBERS, WORLD_MEMBERS, FOLLOW_MEMBERS, GAME_MEMBERS,
  memberNames, createLoop, createInput, createStates, createEvents, createTimers, createWorld, followCamera,
} from '../src/index.js';

const fuente = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

/** Los miembros de un objeto literal `const <nombre> = {` del fuente: métodos, getters, setters y claves. */
function apiDe(s, nombre) {
  const i = s.indexOf(`const ${nombre} = {`);
  assert.ok(i >= 0, `no está const ${nombre} = {`);
  const cuerpo = s.slice(i, s.indexOf('\n  };', i));
  const api = new Set();
  for (const m of cuerpo.matchAll(/^ {4}(?:async |get |set )?([A-Za-z_$][\w$]*)\s*(?:\(|:|,)/gm)) api.add(m[1]);
  assert.ok(api.size > 0, `${nombre} sin miembros`);
  return api;
}
/** @param {Set<string>} api @param {Set<string>} doc @param {string} que */
function coinciden(api, doc, que) {
  for (const n of api) assert.ok(doc.has(n), `${que}${n} está en la API pero no en la tabla de help()`);
  for (const n of doc) assert.ok(api.has(n), `${que}${n} está en la tabla de help() pero no en la API`);
}
const nombres = (tabla) => new Set(tabla.flatMap(([sig]) => memberNames(sig)));

test('lo puro no importa three ni el DOM', async () => {
  for (const f of await readdir(new URL('../src/', import.meta.url))) {
    const s = await fuente(`src/${f}`);
    assert.doesNotMatch(s, /from 'three/, f);
    assert.doesNotMatch(s, /\b(document|window)\./, f);
    for (const [, de] of s.matchAll(/from '([^']+)'/g)) assert.ok(de.startsWith('./'), `${f} importa ${de}: src/ solo importa de src/`);
  }
});

test('ningún motor importa a otro motor de la suite: los recibe ya creados', async () => {
  for (const f of ['adapters/three/game.js', ...(await readdir(new URL('../src/', import.meta.url))).map((x) => `src/${x}`)]) {
    // los imports de verdad (un comentario puede mostrar cómo los importa la app)
    assert.doesNotMatch(await fuente(f), /^\s*(import|export)\b[^;]*from\s*'(threejs-|@easyindustry)/im, f);
    assert.doesNotMatch(await fuente(f), /\bimport\(\s*'(threejs-|@easyindustry)/i, f);
  }
});

test('el adaptador es lo único que importa three', async () => {
  const s = await fuente('adapters/three/game.js');
  assert.match(s, /^import \* as THREE from 'three';$/m);
});

test('cada tabla de help() del núcleo y la API de su objeto coinciden, en las dos direcciones', async () => {
  const casos = [
    ['src/loop.js', 'loop', LOOP_MEMBERS],
    ['src/input.js', 'input', INPUT_MEMBERS],
    ['src/states.js', 'states', STATES_MEMBERS],
    ['src/events.js', 'events', EVENTS_MEMBERS],
    ['src/timers.js', 'timers', TIMERS_MEMBERS],
    ['src/world.js', 'world', WORLD_MEMBERS],
    ['src/camera.js', 'rig', FOLLOW_MEMBERS],
  ];
  for (const [f, obj, tabla] of casos) coinciden(apiDe(await fuente(f), obj), nombres(tabla), `${f}: `);
});

test('la tabla de help() y la API del juego coinciden, en las dos direcciones', async () => {
  const s = await fuente('adapters/three/game.js');
  coinciden(apiDe(s, 'game'), nombres(GAME_MEMBERS), 'game.');
});

test('la tabla de help() y game.camera coinciden, en las dos direcciones', async () => {
  const s = await fuente('adapters/three/game.js');
  const doc = new Set(GAME_MEMBERS.map(([sig]) => sig.match(/^camera\.([A-Za-z_$][\w$]*)/)?.[1]).filter(Boolean));
  coinciden(apiDe(s, 'camera'), doc, 'game.camera.');
});

test('help() devuelve la tabla (y la imprime solo si se pide)', () => {
  const objetos = [createLoop(), createInput(), createStates(), createEvents(), createTimers(), createWorld(), followCamera()];
  const tablas = [LOOP_MEMBERS, INPUT_MEMBERS, STATES_MEMBERS, EVENTS_MEMBERS, TIMERS_MEMBERS, WORLD_MEMBERS, FOLLOW_MEMBERS];
  objetos.forEach((o, i) => {
    const filas = o.help({ print: false });
    assert.equal(filas.length, tablas[i].length);
    assert.deepEqual(Object.keys(filas[0]), ['member', 'description']);
  });
});

test('cada línea de cada tabla tiene firma y descripción, sin repetir', () => {
  for (const tabla of [LOOP_MEMBERS, INPUT_MEMBERS, STATES_MEMBERS, EVENTS_MEMBERS, TIMERS_MEMBERS, WORLD_MEMBERS, FOLLOW_MEMBERS, GAME_MEMBERS]) {
    const firmas = tabla.map(([sig]) => sig);
    assert.equal(new Set(firmas).size, firmas.length, `repetida en ${firmas.join(', ')}`);
    for (const [sig, doc] of tabla) assert.ok(sig && doc && doc.length > 3, sig);
  }
});

test('package.json: sin dependencias de ejecución, three como peer opcional, las dos entradas', async () => {
  const p = JSON.parse(await fuente('package.json'));
  assert.equal(p.dependencies, undefined);
  assert.deepEqual(Object.keys(p.devDependencies), ['typescript']);
  assert.equal(p.peerDependencies.three, '>=0.160.0');
  assert.equal(p.peerDependenciesMeta.three.optional, true);
  assert.deepEqual(p.exports, { '.': './src/index.js', './three': './adapters/three/game.js' });
  const ch = await fuente('CHANGELOG.md');
  assert.match(ch, new RegExp(`## \\[${p.version.replace(/\./g, '\\.')}\\]`), 'la versión de package.json tiene su entrada en el CHANGELOG');
});
