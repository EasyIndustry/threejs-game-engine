// Las pruebas de la entrada como acciones: los controles como datos, los flancos con el paso
// fijo (que justPressed no se pierda ni se cuente dos veces), los ejes y el gamepad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput, defineBindings, readGamepads, deadzone, PAD_BUTTONS, createLoop } from '../src/index.js';

const BINDINGS = {
  saltar: ['Space', 'pad:a'],
  disparar: ['mouse:0', 'pad:rt'],
  mover: { type: 'axis2', keys: { up: ['KeyW', 'ArrowUp'], down: 'KeyS', left: 'KeyA', right: 'KeyD' }, pad: 'pad:left' },
};
const casi = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

/** Un cuadro del juego como lo corre el adaptador: n pasos fijos y después el cuadro. */
function cuadro(input, n, enPaso = () => {}, enCuadro = () => {}) {
  for (let i = 0; i < n; i++) { input.beginStep(); enPaso(i); input.endStep(); }
  enCuadro();
  input.endFrame();
}

test('defineBindings: atajos a la forma completa, y la forma completa vuelve igual', () => {
  const b = defineBindings(BINDINGS);
  assert.deepEqual(b.saltar, ['Space', 'pad:a']);
  assert.deepEqual(b.mover, { type: 'axis2', keys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] }, pad: 'pad:left', deadzone: 0.15 });
  assert.deepEqual(defineBindings(b), b);
  assert.deepEqual(defineBindings({ x: { type: 'button', codes: 'KeyX' } }).x, ['KeyX']);
  assert.deepEqual(createInput(createInput(BINDINGS).bindings()).bindings(), b);
});

test('defineBindings: un error dice dónde, y una clave que no existe no se ignora', () => {
  assert.throws(() => defineBindings({ saltar: ['Space', 'w'] }), /saltar\[1\]: 'w' es una letra.*'KeyW'/);
  assert.throws(() => defineBindings({ saltar: ['space'] }), /saltar\[0\]: 'space' no es un código/);
  assert.throws(() => defineBindings({ saltar: ['pad:z'] }), /saltar\[0\]: 'pad:z' no es un botón del gamepad/);
  assert.throws(() => defineBindings({ disparar: ['mouse:7'] }), /disparar\[0\]: 'mouse:7'/);
  assert.throws(() => defineBindings({ mover: { type: 'axis2', keyz: {} } }), /mover: clave desconocida: keyz/);
  assert.throws(() => defineBindings({ mover: { type: 'axis2', keys: { arriba: 'KeyW' } } }), /mover\.keys: clave desconocida: arriba/);
  assert.throws(() => defineBindings({ mover: { type: 'axis2', pad: 'pad:a' } }), /mover\.pad/);
  assert.throws(() => defineBindings({ mover: { type: 'axis3' } }), /mover\.type/);
  assert.throws(() => defineBindings({ mover: { type: 'axis2', deadzone: 1 } }), /mover\.deadzone/);
});

test('pressed, y una acción con varios códigos no da flancos de más', () => {
  const input = createInput(BINDINGS);
  input.press('Space');
  assert.equal(input.pressed('saltar'), true);
  assert.equal(input.justPressed('saltar'), true);
  input.endFrame();
  input.press('pad:a'); // ya estaba apretada por Space
  assert.equal(input.justPressed('saltar'), false);
  input.release('Space');
  assert.equal(input.pressed('saltar'), true, 'sigue el pad:a');
  input.release('pad:a');
  assert.equal(input.pressed('saltar'), false);
  assert.equal(input.justReleased('saltar'), true);
});

test('justPressed con el paso fijo: un cuadro con 0 pasos no lo pierde', () => {
  const input = createInput(BINDINGS);
  const vistos = [];
  input.press('Space');
  cuadro(input, 0); // la máquina va rápida: este cuadro no tuvo pasos fijos
  cuadro(input, 1, () => vistos.push(input.justPressed('saltar')));
  assert.deepEqual(vistos, [true]);
});

test('justPressed con el paso fijo: un cuadro con 2 pasos no lo cuenta dos veces', () => {
  const input = createInput(BINDINGS);
  const vistos = [];
  input.press('Space');
  cuadro(input, 2, () => vistos.push(input.justPressed('saltar')));
  cuadro(input, 2, () => vistos.push(input.justPressed('saltar')));
  assert.deepEqual(vistos, [true, false, false, false]);
  assert.equal(input.pressed('saltar'), true);
});

test('el paso se cierra solo: beginStep cierra el anterior, y endStep sin paso abierto no borra nada', () => {
  const input = createInput(BINDINGS);
  input.press('Space');
  input.endStep(); // sin paso abierto: el flanco sigue esperando
  const vistos = [];
  input.beginStep(); vistos.push(input.justPressed('saltar'));
  input.beginStep(); vistos.push(input.justPressed('saltar')); // sin endStep en el medio
  input.endStep();
  vistos.push(input.justPressed('saltar')); // afuera del paso: el flanco del cuadro
  assert.deepEqual(vistos, [true, false, true]);
});

test('afuera de un paso (un menú por cuadro) vale el flanco del cuadro, y se apaga en endFrame', () => {
  const input = createInput(BINDINGS);
  const enCuadro = [];
  input.press('Space');
  cuadro(input, 2, () => {}, () => enCuadro.push(input.justPressed('saltar')));
  cuadro(input, 1, () => {}, () => enCuadro.push(input.justPressed('saltar')));
  assert.deepEqual(enCuadro, [true, false]);
});

test('un toque rapidísimo (apretar y soltar entre dos cuadros) no se pierde', () => {
  const input = createInput(BINDINGS);
  input.press('Space');
  input.release('Space');
  const visto = [];
  cuadro(input, 1, () => visto.push([input.pressed('saltar'), input.justPressed('saltar'), input.justReleased('saltar')]));
  assert.deepEqual(visto, [[false, true, true]]);
});

test('con el loop de verdad: a 30 fps (2 pasos por cuadro) y a 144 (0 o 1), un salto por toque', () => {
  for (const fps of [30, 144]) {
    const input = createInput(BINDINGS);
    let saltos = 0;
    const loop = createLoop({ onFixed: () => { input.beginStep(); if (input.justPressed('saltar')) saltos++; input.endStep(); }, onUpdate: () => input.endFrame() });
    for (let i = 0; i < fps + 20; i++) {
      if (i < fps && i % 10 === 3) input.press('Space');
      if (i % 10 === 4) input.release('Space');
      loop.advance(1 / fps);
    }
    assert.equal(saltos, Math.ceil((fps - 3) / 10), `${fps} fps`);
  }
});

test('axis2: teclas en diagonal normalizadas, stick con zona muerta, y nunca de largo más de 1', () => {
  const input = createInput(BINDINGS);
  input.press('KeyW'); input.press('KeyD');
  const [x, y] = input.axis2('mover');
  casi(x, Math.SQRT1_2); casi(y, Math.SQRT1_2);
  input.releaseAll();
  input.axis('pad:left', 0.1, 0.05);
  assert.deepEqual(input.axis2('mover'), [0, 0], 'adentro de la zona muerta');
  input.axis('pad:left', 1, 0);
  assert.deepEqual(input.axis2('mover'), [1, 0]);
  input.press('KeyD');
  const [x2, y2] = input.axis2('mover');
  casi(Math.hypot(x2, y2), 1);
  input.release('KeyD');
  input.axis('pad:left', 0.575, 0);
  casi(input.axis2('mover')[0], 0.5, 1e-9); // (0.575 − 0.15) / 0.85
});

test('deadzone: sin salto en el borde de la zona y tope 1', () => {
  assert.deepEqual(deadzone(0.15, 0, 0.15), [0, 0]);
  assert.ok(deadzone(0.1501, 0, 0.15)[0] < 0.001);
  const [x, y] = deadzone(3, 4, 0.2);
  casi(x, 0.6); casi(y, 0.8);
});

test('axis2 con la cruz del gamepad (pad:dpad), para un juego de plataformas', () => {
  const input = createInput({ mover: { type: 'axis2', pad: 'pad:dpad' } });
  input.press('pad:left');
  assert.deepEqual(input.axis2('mover'), [-1, 0]);
});

test('preguntar mal es un error claro', () => {
  const input = createInput(BINDINGS);
  assert.throws(() => input.pressed('salta'), /acción desconocida: salta \(van saltar, disparar, mover\)/);
  assert.throws(() => input.pressed('mover'), /mover es un eje.*axis2/);
  assert.throws(() => input.axis2('saltar'), /saltar es un botón/);
  assert.throws(() => input.press('w'), /letra/);
  assert.throws(() => input.axis('pad:a', 0, 0), /axis\(name\)/);
});

test('value: un gatillo a medias', () => {
  const input = createInput(BINDINGS);
  input.press('pad:rt', 0.4);
  assert.equal(input.value('disparar'), 0.4);
  input.press('pad:rt', 0.9);
  assert.equal(input.value('disparar'), 0.9);
  assert.equal(input.justPressed('disparar'), true);
  assert.throws(() => input.press('pad:rt', 2), /de 0 a 1/);
});

test('rebind: cambia los controles sin flancos fantasma, y bindings() lo guarda', () => {
  const input = createInput(BINDINGS);
  input.press('KeyJ');
  input.rebind('saltar', ['KeyJ']);
  assert.equal(input.pressed('saltar'), true, 'la tecla ya estaba apretada');
  assert.equal(input.justPressed('saltar'), false, 'sin flanco inventado');
  assert.deepEqual(input.bindings().saltar, ['KeyJ']);
  input.rebind('mover', { type: 'axis2', keys: { left: 'ArrowLeft', right: 'ArrowRight' } });
  assert.deepEqual(input.bindings().mover.keys.up, []);
  assert.throws(() => input.rebind('saltar', { type: 'axis2' }), /era un botón/);
  assert.throws(() => input.rebind('volar', ['KeyF']), /rebind: acción desconocida: volar/);
});

test('releaseAll (al perder el foco): suelta todo y avisa justReleased', () => {
  const input = createInput(BINDINGS);
  input.press('Space'); input.press('mouse:0'); input.axis('pad:left', 1, 0);
  input.endFrame();
  input.releaseAll();
  assert.equal(input.pressed('saltar'), false);
  assert.equal(input.justReleased('disparar'), true);
  assert.deepEqual(input.axis2('mover'), [0, 0]);
  assert.deepEqual(input.down, []);
});

test('readGamepads: mapeo estándar, y arriba es y positiva', () => {
  const boton = (pressed, value = pressed ? 1 : 0) => ({ pressed, value });
  const botones = PAD_BUTTONS.map(() => boton(false));
  botones[0] = boton(true); botones[7] = boton(true, 0.7); botones[12] = boton(true);
  const snap = readGamepads([null, { connected: true, mapping: 'standard', buttons: botones, axes: [0.5, -1, 0, 0.25] }, { connected: true, mapping: '', buttons: [boton(true)], axes: [1, 1] }]);
  assert.deepEqual(snap.buttons, { a: 1, rt: 0.7, up: 1 });
  assert.deepEqual(snap.sticks.left, [0.5, 1]);
  assert.deepEqual(snap.sticks.right, [0, -0.25]);
  assert.deepEqual(readGamepads(null), { buttons: {}, sticks: { left: [0, 0], right: [0, 0] } });
});

test('pad(snapshot): aprieta y suelta lo que cambió', () => {
  const input = createInput(BINDINGS);
  input.pad({ buttons: { a: 1 }, sticks: { left: [0, 1], right: [0, 0] } });
  assert.equal(input.justPressed('saltar'), true);
  assert.deepEqual(input.axis2('mover'), [0, 1]);
  input.endFrame();
  input.pad({ buttons: { a: 1 }, sticks: { left: [0, 1], right: [0, 0] } });
  assert.equal(input.justPressed('saltar'), false, 'seguir apretado no es un flanco nuevo');
  input.pad({ buttons: {}, sticks: { left: [0, 0], right: [0, 0] } });
  assert.equal(input.justReleased('saltar'), true);
});
