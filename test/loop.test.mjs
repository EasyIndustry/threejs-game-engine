// Las pruebas del loop de paso fijo: cuántos pasos corre, alpha, el tope, la pausa, cuadro a
// cuadro y que el juego dé lo mismo a cualquier cantidad de cuadros por segundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../src/index.js';

const casi = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('corre los pasos fijos que entran y después onUpdate una vez, con alpha', () => {
  const pasos = [], cuadros = [];
  const loop = createLoop({ step: 0.1, onFixed: (dt) => pasos.push(dt), onUpdate: (dt, alpha) => cuadros.push([dt, alpha]) });
  assert.equal(loop.advance(0.25), 2);
  assert.deepEqual(pasos, [0.1, 0.1]);
  assert.equal(cuadros.length, 1);
  casi(cuadros[0][1], 0.5);
  assert.equal(loop.advance(0.04), 0); // 0.09 acumulado: ningún paso
  casi(loop.alpha, 0.9);
  assert.equal(loop.advance(0.01), 1);
  assert.equal(loop.frame, 3);
  casi(loop.time, 0.3);
});

test('1/60 tres veces son tres pasos, aunque en coma flotante no dé justo', () => {
  const loop = createLoop();
  let n = 0;
  for (let i = 0; i < 600; i++) n += loop.advance(1 / 60);
  assert.equal(n, 600);
  assert.equal(loop.frame, 600);
});

test('el mismo tiempo total da los mismos pasos a 30, 60 o 144 cuadros por segundo', () => {
  const correr = (fps) => {
    let x = 0, v = 0;
    const loop = createLoop({ step: 1 / 60, onFixed: (dt) => { v += 9.8 * dt; x += v * dt; } });
    for (let i = 0; i < fps * 2; i++) loop.advance(1 / fps);
    return { x, frame: loop.frame };
  };
  const a = correr(30), b = correr(60), c = correr(144);
  assert.equal(a.frame, 120); assert.equal(b.frame, 120); assert.equal(c.frame, 120);
  assert.equal(a.x, b.x); assert.equal(b.x, c.x);
});

test('con un dt enorme corre a lo sumo maxSteps y descarta el resto: sin espiral de la muerte', () => {
  let n = 0;
  const loop = createLoop({ step: 1 / 60, maxSteps: 4, onFixed: () => n++ });
  assert.equal(loop.advance(5), 4);
  assert.equal(n, 4);
  assert.ok(loop.dropped > 290, `descartó ${loop.dropped}`);
  assert.ok(loop.alpha >= 0 && loop.alpha < 1);
  assert.equal(loop.advance(1 / 60), 1, 'el cuadro siguiente sigue normal');
});

test('pausa: no corren pasos y onUpdate sigue con dt 0; al volver no se pone al día', () => {
  const cuadros = [];
  let n = 0;
  const loop = createLoop({ step: 0.1, onFixed: () => n++, onUpdate: (dt, a, real) => cuadros.push([dt, real]) });
  loop.pause();
  assert.equal(loop.paused, true);
  assert.equal(loop.advance(1), 0);
  assert.deepEqual(cuadros[0], [0, 1]);
  loop.resume();
  assert.equal(loop.advance(0.1), 1);
  assert.equal(n, 1);
});

test('stepOnce: un paso aunque esté en pausa, para depurar cuadro a cuadro', () => {
  let n = 0;
  const loop = createLoop({ step: 0.1, onFixed: () => n++ });
  loop.pause();
  loop.stepOnce(); loop.stepOnce();
  assert.equal(n, 2);
  assert.equal(loop.frame, 2);
  casi(loop.time, 0.2);
});

test('timeScale: cámara lenta y congelado', () => {
  let n = 0;
  const loop = createLoop({ step: 0.1, onFixed: () => n++ });
  loop.timeScale = 0.5;
  loop.advance(1);
  assert.equal(n, 5);
  loop.timeScale = 0;
  loop.advance(1);
  assert.equal(n, 5);
  assert.throws(() => { loop.timeScale = -1; }, /timeScale/);
});

test('onFixed y onUpdate devuelven cómo sacarlos; reset vuelve a cero', () => {
  const loop = createLoop({ step: 0.1 });
  let n = 0;
  const sacar = loop.onFixed(() => n++);
  loop.advance(0.2);
  sacar();
  loop.advance(0.2);
  assert.equal(n, 2);
  loop.reset();
  assert.equal(loop.frame, 0);
  assert.equal(loop.time, 0);
});

test('opciones mal escritas o fuera de rango son errores que dicen dónde', () => {
  assert.throws(() => createLoop({ stepp: 1 }), /clave desconocida: stepp/);
  assert.throws(() => createLoop({ step: 0 }), /step: va un número mayor que 0/);
  assert.throws(() => createLoop({ maxSteps: 0 }), /maxSteps/);
  assert.throws(() => createLoop().advance(-1), /advance\(dt\)/);
  assert.throws(() => createLoop().advance(NaN), /advance\(dt\)/);
  assert.throws(() => createLoop().onFixed(3), /va una función/);
});
