// Las tablas de help(): una línea por miembro, una tabla por objeto. Viven aparte (puras, sin
// three) para que las pruebas en Node las comparen con la API de cada objeto, leyendo el fuente,
// en las dos direcciones.
//
// Puro: no importa three ni DOM.

/** @type {import('./help.js').Member[]} */
export const LOOP_MEMBERS = [
  ['advance(dt)', 'avanzar el tiempo real del cuadro (segundos): corre los pasos fijos que entren (a lo sumo maxSteps) y después onUpdate; devuelve cuántos pasos corrió'],
  ['stepOnce()', 'un solo paso fijo aunque esté en pausa (depurar cuadro a cuadro), y después onUpdate'],
  ['pause()', 'frenar el tiempo del juego: no corren pasos fijos (onUpdate sigue, con dt 0)'],
  ['resume()', 'volver a andar, sin ponerse al día con lo que estuvo en pausa'],
  ['paused', '¿está en pausa?'],
  ['step', 'cuánto dura un paso fijo (segundos de juego; 1/60 por defecto)'],
  ['maxSteps', 'cuántos pasos fijos corre a lo sumo por cuadro (5): el resto se descarta, sin espiral de la muerte'],
  ['timeScale', 'la velocidad del tiempo: 1 normal, 0.5 cámara lenta, 0 congelado (se puede asignar)'],
  ['time', 'el tiempo del juego en segundos (la suma de los pasos fijos)'],
  ['frame', 'el número de paso fijo: cuántos corrieron'],
  ['alpha', 'cuánto del paso siguiente ya pasó (0 a 1): lo dibujado es anterior + (actual − anterior) · alpha'],
  ['dropped', 'cuántos pasos se descartaron porque la máquina no daba abasto'],
  ['onFixed(fn)', 'algo que corre en cada paso fijo: fn(dt); devuelve cómo sacarlo'],
  ['onUpdate(fn)', 'algo que corre una vez por cuadro, después de los pasos: fn(dt, alpha, dtReal); devuelve cómo sacarlo'],
  ['reset()', 'el tiempo, el número de paso y lo acumulado a cero'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const INPUT_MEMBERS = [
  ['press(code, value?)', "se apretó algo: 'KeyW' (KeyboardEvent.code), 'mouse:0', 'pad:a'; value de 0 a 1 para un gatillo"],
  ['release(code)', 'se soltó algo'],
  ['axis(name, x, y)', "un stick: 'pad:left' | 'pad:right', x a la derecha e y hacia arriba, de −1 a 1"],
  ['pad(snapshot)', 'lo que dicen los gamepads (de readGamepads): aprieta y suelta los botones pad:… que cambiaron y pone los sticks'],
  ['releaseAll()', 'soltar todo (al perder el foco: que no quede una tecla trabada)'],
  ['pressed(action)', '¿está apretada la acción?'],
  ['justPressed(action)', '¿se apretó recién? En un paso fijo, desde el paso anterior (no se pierde con 0 pasos ni se cuenta dos veces con 2); afuera, en este cuadro'],
  ['justReleased(action)', '¿se soltó recién? Como justPressed'],
  ['value(action)', 'cuánto está apretada, de 0 a 1 (un gatillo a medias)'],
  ['axis2(action)', 'un eje: [x, y] de largo 1 a lo sumo, teclas (diagonal normalizada) + stick o cruz con zona muerta'],
  ['beginStep()', 'empieza un paso fijo (y cierra el anterior si seguía abierto): los flancos son los del paso'],
  ['endStep()', 'termina el paso fijo abierto: apaga sus flancos (sin paso abierto, nada)'],
  ['endFrame()', 'termina el cuadro: apaga los flancos del cuadro'],
  ['rebind(action, binding)', 'cambiar los controles de una acción (el menú de controles); lo apretado sigue apretado, sin flancos nuevos'],
  ['bindings()', 'los controles en su forma completa, como datos: se guardan y se vuelven a cargar con createInput'],
  ['down', 'los códigos apretados ahora (para "apretá una tecla")'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const STATES_MEMBERS = [
  ['push(state, ...args)', 'poner un estado arriba: el de abajo recibe pause() y el nuevo enter(...args)'],
  ['pop()', 'sacar el de arriba (exit) y el de abajo sigue (resume); devuelve el que sacó'],
  ['replace(state, ...args)', 'cambiar el de arriba: el viejo recibe exit() y el nuevo enter(...args)'],
  ['clear()', 'sacar todos, de arriba hacia abajo'],
  ['current', 'el estado de arriba (el que corre), o null'],
  ['stack', 'la pila, de abajo hacia arriba (una copia)'],
  ['fixed(dt)', 'correr el paso fijo del estado de arriba'],
  ['update(dt, alpha?)', 'correr el cuadro del estado de arriba'],
  ['onChange(fn)', 'algo que corre cuando cambia la pila: { action, current, previous }; devuelve cómo sacarlo'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const EVENTS_MEMBERS = [
  ['on(name, fn)', 'escuchar un evento; devuelve cómo dejar de escucharlo'],
  ['once(name, fn)', 'escuchar solo la próxima vez'],
  ['off(name, fn?)', 'dejar de escuchar: un oyente, o todos los de ese evento'],
  ['emit(name, ...args)', 'avisar: corre los oyentes (uno que falla no corta a los demás); devuelve cuántos corrieron'],
  ['count(name)', 'cuántos oyentes tiene un evento'],
  ['clear()', 'sacar todos los oyentes'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const TIMERS_MEMBERS = [
  ['after(s, fn)', 'una vez, dentro de s segundos de juego; devuelve cómo cancelarlo'],
  ['every(s, fn)', 'cada s segundos de juego, fn(vez); devuelve cómo cancelarlo'],
  ['update(dt)', 'avanzar el tiempo y correr lo que toca, en orden (el juego lo hace en cada paso fijo)'],
  ['time', 'el tiempo de los temporizadores, en segundos'],
  ['size', 'cuántos hay pendientes'],
  ['clear()', 'cancelar todos'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const WORLD_MEMBERS = [
  ['add(components)', 'agregar una entidad: el mismo objeto con su id; name y tags son de la entidad, el resto son componentes'],
  ['remove(entity)', 'sacarla del mundo; devuelve si estaba'],
  ['has(entity)', '¿está en el mundo?'],
  ['get(id)', 'la entidad con ese id'],
  ['set(entity, component, value)', 'agregar o cambiar un componente, manteniendo los índices'],
  ['unset(entity, component)', 'sacar un componente, manteniendo los índices'],
  ['query(...components)', 'las entidades con todos esos componentes (indexado; el array no cambia después: se puede agregar y sacar mientras se recorre)'],
  ['byName(name)', 'la primera entidad con ese nombre'],
  ['named(name)', 'todas las entidades con ese nombre'],
  ['tagged(tag)', 'las entidades con esa etiqueta'],
  ['tag(entity, ...tags)', 'ponerle etiquetas'],
  ['untag(entity, ...tags)', 'sacarle etiquetas'],
  ['entities', 'todas las entidades (una copia)'],
  ['size', 'cuántas hay'],
  ['system(name, fn, { order?, phase? })', "un sistema: phase 'fixed' fn(dt, world) o 'update' fn(dt, alpha, world), de menor a mayor order; devuelve cómo sacarlo"],
  ['systems', 'los sistemas en el orden en que corren: [{ name, phase, order }]'],
  ['fixed(dt)', 'correr los sistemas del paso fijo'],
  ['update(dt, alpha?)', 'correr los sistemas del cuadro'],
  ['onAdd(fn)', 'algo que corre al agregar una entidad; devuelve cómo sacarlo'],
  ['onRemove(fn)', 'algo que corre al sacar una entidad; devuelve cómo sacarlo'],
  ['clear()', 'sacar todas las entidades (los sistemas quedan)'],
  ['toJSON()', 'los componentes que son datos, para guardar partida: { version, nextId, entities }'],
  ['fromJSON(json, { revive? })', 'cargar una partida: saca todo y agrega lo guardado con sus ids; revive(e) vuelve a poner lo que no es datos'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const FOLLOW_MEMBERS = [
  ['update(subject, dt)', 'un cuadro: dado { position, heading? } y dt, el estado { position, target } suavizado, listo para view.set()'],
  ['reset()', 'la próxima actualización va directo, sin suavizar (un teletransporte)'],
  ['state', 'el último estado { position, target }, o null'],
  ['options(o?)', "cambiar opciones: mode ('behind' | 'top' | 'side'), offset, look, lookAhead, damping, turnDamping, collide, collideDamping; sin argumentos, cómo están"],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const GAME_MEMBERS = [
  ['engine', 'el motor que recibió (threejs-render-engine, o cualquier objeto con onFrame y view.set)'],
  ['loop', 'el loop de paso fijo (createLoop): timeScale, stepOnce, time, frame…'],
  ['input', 'la entrada como acciones (createInput), alimentada por el teclado, el mouse y el gamepad'],
  ['states', 'la pila de estados del juego (createStates): menú, nivel, pausa'],
  ['world', 'las entidades y los sistemas (createWorld); object3d + transform se dibujan solos, interpolados'],
  ['events', 'el bus de eventos (createEvents)'],
  ['timers', 'los temporizadores con el tiempo del juego (createTimers)'],
  ['camera', 'la cámara de juego: follow y release, con view.suspend del motor mientras es del juego'],
  ['camera.follow(subject, opts?)', 'seguir una entidad, un Object3D, algo con .object (un sprite, un emisor) o una función → { position, heading }; opts de followCamera, y collide: true choca con motor.content'],
  ['camera.release()', 'devolver la cámara al motor (la órbita del usuario vuelve)'],
  ['camera.following', 'lo que sigue, o null'],
  ['camera.rig', 'la followCamera en uso (rig.options() para cambiar el modo), o null'],
  ['start()', 'engancharse a engine.onFrame y a la entrada del DOM: el juego anda'],
  ['pause()', 'frenar el tiempo del juego (loop.pause): no corren pasos fijos ni temporizadores'],
  ['resume()', 'volver a andar'],
  ['running', '¿está andando (start sin dispose)?'],
  ['snap(entity)', 'dibujar el transform de la entidad tal cual, sin interpolar desde donde estaba (un teletransporte)'],
  ['stats()', 'cómo anda: { time, frame, steps, dropped, entities, systems, state }'],
  ['dispose()', 'soltar todo: el cuadro, la entrada, la cámara, los estados (exit) y las entidades'],
  ['help()', 'esta tabla'],
];
