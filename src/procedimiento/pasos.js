/**
 * PASOS DEL PROCEDIMIENTO EXPERIMENTAL (editable).
 *
 * Cada paso tiene un título y una ayuda breve (lo que se ve en el panel «Procedimiento») y una condición
 * `cumplido(c)` que el laboratorio evalúa con hechos objetivos: qué hay conectado, cómo está el equipo y qué
 * registros se imprimieron. Ninguna condición de las partes A–C dice si un electrodo está en el sitio correcto:
 * solo si el estudiante hizo la acción. Esa verificación es la del botón «Revisar montaje».
 *
 * Un paso cumplido queda marcado aunque después se deshaga la acción (por ejemplo, al desconectar el cable
 * en el cierre). Los pasos del cierre (parte F) solo se marcan después de completar las partes A a E.
 * Son 17 pasos: la parte E pide tres conexiones incorrectas (RA↔LA, RA↔RL y LA desenganchado).
 * La guía del estudiante describe cada paso con detalle y con la misma numeración.
 *
 * Contexto `c` que reciben las condiciones:
 *   { montaje, ajustes, paciente: {voluntario, nombre}, registros, eventos: {revisionCorrecta, calibrado}, entradas }
 */
import { ENTRADAS } from '../modelo/derivaciones.js';
import { ENTRADAS_EXTREMIDADES, ENTRADAS_PRECORDIALES } from '../config/electrodos.js';

export const PARTES = Object.freeze([
  { id: 'A', titulo: 'Preparación del equipo' },
  { id: 'B', titulo: 'Electrodos y cables' },
  { id: 'C', titulo: 'Verificación del montaje' },
  { id: 'D', titulo: 'Registro de referencia' },
  { id: 'E', titulo: 'Conexiones incorrectas' },
  { id: 'F', titulo: 'Cierre' },
]);

const EXTREMIDADES = ['brazo_der', 'brazo_izq', 'pierna_der', 'pierna_izq'];

const electrodoDe = (c, entrada) => {
  const id = c.montaje.cables[entrada];
  return id ? c.montaje.electrodos[id] ?? null : null;
};

/** ¿Hay un registro uniforme del sujeto actual con esta condición? */
const hayRegistro = (c, condicion) =>
  c.registros.some((r) => r.condicion === condicion && r.uniforme && r.voluntario === c.paciente.voluntario);

const registroDe = (condicion, titulo, ayuda) => ({ id: condicion, parte: 'E', titulo, ayuda, cumplido: (c) => hayRegistro(c, condicion), registro: true });

export const PASOS = Object.freeze([
  {
    id: 'conectar-cable',
    parte: 'A',
    titulo: 'Conecte el cable de paciente al equipo',
    ayuda: 'Arrastre la clavija del cable de paciente hasta el conector «PACIENTE» del electrocardiógrafo.',
    cumplido: (c) => c.montaje.cableTroncal,
  },
  {
    id: 'encender',
    parte: 'A',
    titulo: 'Encienda el electrocardiógrafo',
    ayuda: 'Pulse el botón de encendido y espere a que el equipo inicie.',
    cumplido: (c) => c.ajustes.encendido,
  },
  {
    id: 'datos',
    parte: 'A',
    titulo: 'Ingrese los datos del registro',
    ayuda: 'Pulse la tecla «Paciente», revise los datos del sujeto y escriba su nombre: aparecerá en cada registro impreso.',
    cumplido: (c) => Boolean(c.paciente.nombre && c.paciente.nombre.trim()),
  },
  {
    id: 'pinzas',
    parte: 'B',
    titulo: 'Coloque una pinza en cada extremidad',
    ayuda: 'Arrastre las pinzas de la bandeja a las muñecas y los tobillos, con los contactos hacia la cara interna.',
    cumplido: (c) => {
      const zonas = new Set(Object.values(c.montaje.electrodos).filter((e) => e.tipo === 'pinza').map((e) => e.sitio.zona));
      return EXTREMIDADES.every((z) => zonas.has(z));
    },
  },
  {
    id: 'adhesivos',
    parte: 'B',
    titulo: 'Coloque los seis electrodos precordiales',
    ayuda: 'En la vista «Tórax», ubique el ángulo esternal, cuente los espacios intercostales y coloque V1 a V6.',
    cumplido: (c) => Object.values(c.montaje.electrodos).filter((e) => e.tipo === 'adhesivo' && e.sitio.zona === 'torso').length === 6,
  },
  {
    id: 'cables-extremidades',
    parte: 'B',
    titulo: 'Enganche los cables RA, LA, LL y RL',
    ayuda: 'Arrastre cada terminal hasta la pinza de su extremidad. Fíjese en la etiqueta y el color de cada cable.',
    cumplido: (c) => ENTRADAS_EXTREMIDADES.every((e) => electrodoDe(c, e)?.tipo === 'pinza'),
  },
  {
    id: 'cables-precordiales',
    parte: 'B',
    titulo: 'Enganche los cables V1 a V6',
    ayuda: 'Arrastre cada terminal precordial hasta su electrodo del tórax.',
    cumplido: (c) => ENTRADAS_PRECORDIALES.every((e) => electrodoDe(c, e)?.tipo === 'adhesivo'),
  },
  {
    id: 'senal-completa',
    parte: 'C',
    titulo: 'Compruebe que los diez electrodos tienen señal',
    ayuda: 'La pantalla debe decir «Conexión completa» y los diez indicadores deben estar encendidos.',
    cumplido: (c) => ENTRADAS.every((e) => c.entradas[e].estado === 'conectada'),
  },
  {
    id: 'revisar',
    parte: 'C',
    titulo: 'Revise el montaje y corrija los errores',
    ayuda: 'Pulse «Revisar montaje». Si hay errores, corríjalos y vuelva a revisar hasta que el montaje sea correcto.',
    cumplido: (c) => Boolean(c.eventos.revisionCorrecta),
    revision: true,
  },
  {
    id: 'calibrar',
    parte: 'D',
    titulo: 'Compruebe la calibración con la tecla «1 mV»',
    ayuda: 'Con el equipo registrando, pulse «1 mV»: con 10 mm/mV, el pulso debe medir 10 mm de alto (dos cuadros grandes).',
    cumplido: (c) => Boolean(c.eventos.calibrado),
  },
  {
    id: 'referencia',
    parte: 'D',
    titulo: 'Imprima el registro de referencia',
    ayuda: 'Con el montaje correcto, espere 20 s sin tocar electrodos ni cables (trazado estable) y pulse «Imprimir».',
    cumplido: (c) => hayRegistro(c, 'referencia'),
    registro: true,
  },
  registroDe('ra-la', 'Intercambie los cables RA y LA e imprima', 'Enganche RA en la pinza del brazo izquierdo y LA en la del derecho. Espere 20 s, imprima y vuelva a la conexión correcta.'),
  registroDe('ra-rl', 'Intercambie los cables RA y RL e imprima', 'Enganche RA en la pinza de la pierna derecha y RL en la del brazo derecho. Espere 20 s, imprima y corrija.'),
  registroDe('la-suelto', 'Desenganche el cable LA e imprima', 'Suelte solo el cable LA (la pinza queda en el brazo). Observe los mensajes del equipo, espere 20 s, imprima y vuelva a engancharlo.'),
  {
    id: 'retirar',
    parte: 'F',
    titulo: 'Retire todos los electrodos',
    ayuda: 'Use «Retirar todos los electrodos» o devuélvalos uno a uno a la bandeja.',
    cumplido: (c) => Object.keys(c.montaje.electrodos).length === 0,
    cierre: true,
  },
  {
    id: 'apagar',
    parte: 'F',
    titulo: 'Apague el electrocardiógrafo',
    ayuda: 'Pulse el botón de encendido.',
    cumplido: (c) => !c.ajustes.encendido,
    cierre: true,
    requiere: ['retirar'],
  },
  {
    id: 'desconectar',
    parte: 'F',
    titulo: 'Desconecte el cable de paciente del equipo',
    ayuda: 'Arrastre la clavija fuera del conector (o púlsela).',
    cumplido: (c) => !c.montaje.cableTroncal,
    cierre: true,
    requiere: ['retirar'],
  },
]);

/** Pasos activos según la configuración (sin «Revisar montaje» si el docente lo deshabilitó). */
export function pasosActivos({ revisionHabilitada = true } = {}) {
  return PASOS.filter((p) => revisionHabilitada || !p.revision);
}

/**
 * Evalúa el procedimiento: devuelve los identificadores de los pasos cumplidos (en orden).
 * Los pasos ya cumplidos se conservan; los de cierre exigen haber cumplido todos los de las partes A–E.
 * @param {object[]} pasos
 * @param {object} c  contexto
 * @param {string[]} [hechosPrevios]
 */
export function evaluarPasos(pasos, c, hechosPrevios = []) {
  const ids = new Set(pasos.map((p) => p.id));
  const hechos = new Set(hechosPrevios.filter((id) => ids.has(id)));
  const principales = pasos.filter((p) => !p.cierre).map((p) => p.id);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const p of pasos) {
      if (hechos.has(p.id)) continue;
      const requisitos = [...(p.requiere ?? []), ...(p.cierre ? principales : [])];
      if (!requisitos.every((r) => hechos.has(r))) continue;
      if (p.cumplido(c)) {
        hechos.add(p.id);
        cambio = true;
      }
    }
  }
  return pasos.filter((p) => hechos.has(p.id)).map((p) => p.id);
}

/** Primer paso sin cumplir (o null si el procedimiento terminó). */
export function pasoActual(pasos, hechos) {
  return pasos.find((p) => !hechos.includes(p.id)) ?? null;
}

/** Identificadores de los pasos que dependen de los registros. */
export const PASOS_DE_REGISTRO = Object.freeze(PASOS.filter((p) => p.registro).map((p) => p.id));
