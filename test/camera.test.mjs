// Las pruebas de la cámara de juego (pura) y del transform: la amortiguación crítica
// independiente del framerate, los tres modos, los choques y la interpolación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followCamera, defineFollow, damp, dampAngle, FOLLOW_MODES, checkTransform, blendTransform, lerpAngle, angleDelta, copyTransform } from '../src/index.js';

const casi = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const casiV = (a, b, eps = 1e-9) => a.forEach((x, i) => casi(x, b[i], eps));

test('damp: la solución exacta del resorte, así que 30 o 144 cuadros por segundo dan lo mismo', () => {
  const correr = (fps) => { let x = 0, v = 0; for (let i = 0; i < fps; i++) [x, v] = damp(x, v, 10, 0.3, 1 / fps); return [x, v]; };
  const [a] = correr(30), [b] = correr(60), [c] = correr(144);
  casi(a, b, 1e-9); casi(b, c, 1e-9);
  assert.ok(a > 9.9 && a <= 10, `en un segundo llegó a ${a}`);
});

test('damp: crítico, no se pasa del objetivo; con 0 llega de una', () => {
  let x = 0, v = 0, max = 0;
  for (let i = 0; i < 600; i++) { [x, v] = damp(x, v, 1, 0.2, 1 / 60); max = Math.max(max, x); }
  assert.ok(max <= 1 + 1e-12, `se pasó: ${max}`);
  assert.deepEqual(damp(3, 5, 7, 0, 1 / 60), [7, 0]);
});

test('dampAngle va por el camino más corto (de 170° a −170° son 20°, no 340°)', () => {
  const R = Math.PI / 180;
  let a = 170 * R, v = 0;
  const pasos = [];
  for (let i = 0; i < 120; i++) { [a, v] = dampAngle(a, v, -170 * R, 0.2, 1 / 60); pasos.push(a); }
  assert.ok(pasos.every((x) => Math.abs(angleDelta(x, 180 * R)) <= 10 * R + 1e-9), 'pasó por 180°, no por 0°');
  casi(angleDelta(a, -170 * R), 0, 1e-6);
});

test('behind: detrás del objetivo y gira con él', () => {
  const cam = followCamera({ mode: 'behind', offset: [0, 2, -5], look: [0, 1, 0], damping: 0 });
  const s0 = cam.update({ position: [0, 0, 0], heading: 0 }, 1 / 60);
  assert.deepEqual(s0, { position: [0, 2, -5], target: [0, 1, 0] });
  cam.reset();
  const s1 = cam.update({ position: [10, 0, 0], heading: Math.PI / 2 }, 1 / 60); // mira hacia +x
  casiV(s1.position, [5, 2, 0]);
  casiV(s1.target, [10, 1, 0]);
  cam.reset();
  // offset x es la derecha del objetivo: mirando a +z, la derecha es −x
  const hombro = followCamera({ offset: [1, 0, -5], damping: 0 }).update({ position: [0, 0, 0], heading: 0 }, 0);
  casi(hombro.position[0], -1);
});

test('behind: el rumbo se suaviza (la cámara no da vuelta de golpe) y llega', () => {
  const cam = followCamera({ mode: 'behind', damping: 0, turnDamping: 0.3 });
  cam.update({ position: [0, 0, 0], heading: 0 }, 1 / 60);
  const a = cam.update({ position: [0, 0, 0], heading: Math.PI / 2 }, 1 / 60);
  assert.ok(a.position[2] < -5, 'casi no giró en un cuadro');
  let s = a;
  for (let i = 0; i < 300; i++) s = cam.update({ position: [0, 0, 0], heading: Math.PI / 2 }, 1 / 60);
  casiV(s.position, [-6, 2.5, 0], 1e-6);
});

test('top: no gira con el objetivo; el punto que sigue se suaviza igual a cualquier framerate', () => {
  const correr = (fps) => {
    const cam = followCamera({ mode: 'top', damping: 0.25 });
    cam.update({ position: [0, 0, 0], heading: 0 }, 0);
    let s;
    for (let i = 0; i < fps / 2; i++) s = cam.update({ position: [4, 0, 0], heading: Math.PI }, 1 / fps);
    return s;
  };
  const a = correr(30), b = correr(144);
  casiV(a.position, b.position, 1e-9);
  assert.equal(a.position[1] - a.target[1], FOLLOW_MODES.top.offset[1] - FOLLOW_MODES.top.look[1]);
  casi(a.position[2] - a.target[2], FOLLOW_MODES.top.offset[2], 1e-9); // el rumbo π no la gira
});

test('side: lookAhead corre la cámara de costado, no la acerca', () => {
  const cam = followCamera({ mode: 'side', lookAhead: 2, damping: 0 });
  const derecha = cam.update({ position: [0, 0, 0], heading: Math.PI / 2 }, 0);
  casi(derecha.target[0], 2);
  const hacia = cam.update({ position: [0, 0, 0], heading: 0 }, 0); // mira a la cámara (+z)
  casiV(hacia.position, [0, 1.5, 14]);
});

test('damping por eje: una cámara de plataformas que sigue rápido en x y lento en y', () => {
  const cam = followCamera({ mode: 'side', damping: [0, 1, 0] });
  cam.update({ position: [0, 0, 0] }, 0);
  const s = cam.update({ position: [3, 3, 0] }, 1 / 60);
  casi(s.target[0], 3);
  assert.ok(s.target[1] < 1.1, `y casi no se movió: ${s.target[1]}`);
});

test('collide: se acerca de una y se aleja suave', () => {
  let pared = 3;
  const cam = followCamera({ mode: 'behind', offset: [0, 0, -10], look: [0, 0, 0], damping: 0, collide: (desde, hasta) => {
    assert.equal(desde.length, 3); assert.equal(hasta.length, 3);
    return pared;
  } });
  const a = cam.update({ position: [0, 0, 0], heading: 0 }, 1 / 60);
  casiV(a.position, [0, 0, -3]);
  pared = null;
  const b = cam.update({ position: [0, 0, 0], heading: 0 }, 1 / 60);
  assert.ok(b.position[2] > -3.5, 'no salta para atrás de golpe');
  let s = b;
  for (let i = 0; i < 300; i++) s = cam.update({ position: [0, 0, 0], heading: 0 }, 1 / 60);
  casiV(s.position, [0, 0, -10], 1e-6);
});

test('defineFollow: completo y con errores que dicen dónde', () => {
  const o = defineFollow({ mode: 'top' });
  assert.deepEqual(o.offset, [...FOLLOW_MODES.top.offset]);
  assert.deepEqual(o.damping, [0.15, 0.15, 0.15]);
  assert.throws(() => defineFollow({ mode: 'iso' }), /followCamera\.mode/);
  assert.throws(() => defineFollow({ ofset: [0, 1, 2] }), /clave desconocida: ofset/);
  assert.throws(() => defineFollow({ offset: [0, 0] }), /followCamera\.offset/);
  assert.throws(() => defineFollow({ offset: [0, 0, 0] }), /no puede estar en el objetivo/);
  assert.throws(() => defineFollow({ damping: [0, -1, 0] }), /followCamera\.damping\[1\]/);
  assert.throws(() => defineFollow({ collide: true }), /collide: va una función/);
  assert.throws(() => followCamera().update({ position: [0, 0] }, 0), /subject\.position/);
});

test('options: cambiar de modo vuelve a los valores de ese modo, salvo los que se pasan', () => {
  const cam = followCamera({ mode: 'behind', offset: [0, 3, -9], lookAhead: 1 });
  const o = cam.options({ mode: 'top' });
  assert.deepEqual(o.offset, [...FOLLOW_MODES.top.offset]);
  assert.equal(o.lookAhead, 1, 'lo demás queda');
  assert.deepEqual(cam.options({ offset: [0, 20, 0] }).offset, [0, 20, 0]);
  assert.equal(cam.state, null);
  cam.update({ position: [0, 0, 0] }, 0);
  assert.ok(cam.state && cam.state.position[1] > 0);
});

// ---------- transform ----------

test('checkTransform: valida, deja el mismo objeto y una escala en número va a los tres ejes', () => {
  const t = { position: [1, 2, 3], scale: 2 };
  assert.equal(checkTransform(t), t);
  assert.deepEqual(t.scale, [2, 2, 2]);
  assert.throws(() => checkTransform({ posicion: [0, 0, 0] }), /clave desconocida: posicion/);
  assert.throws(() => checkTransform({ rotation: [0, NaN, 0] }, 'heroe.transform'), /heroe\.transform\.rotation/);
});

test('blendTransform: posición en línea recta y ángulos por el camino corto', () => {
  const prev = { position: [0, 0, 0], rotation: [0, 3, 0] };
  const cur = { position: [10, 0, 0], rotation: [0, -3, 0], scale: [2, 2, 2] };
  const m = blendTransform(prev, cur, 0.5);
  assert.deepEqual(m.position, [5, 0, 0]);
  casi(Math.abs(angleDelta(m.rotation[1], Math.PI)), 0, 1e-9);
  assert.deepEqual(m.scale, [2, 2, 2], 'sin anterior, el actual');
  assert.deepEqual(blendTransform(null, cur, 0.3).position, [10, 0, 0]);
  casi(lerpAngle(0, Math.PI / 2, 0.5), Math.PI / 4);
  const c = copyTransform(cur);
  c.position[0] = 99;
  assert.equal(cur.position[0], 10);
});
