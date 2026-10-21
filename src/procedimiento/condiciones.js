/**
 * Condiciones de conexión que reconoce el procedimiento.
 *
 * Al imprimir, el laboratorio clasifica el montaje: si coincide con una de las condiciones de la práctica
 * (montaje correcto o uno de los tres errores que pide la guía, y nada más), el registro recibe ese nombre
 * y cuenta para el paso correspondiente. Cualquier otro montaje se guarda como «Registro N», sin revelar qué tiene.
 */
import { diagnosticarMontaje } from '../conexiones/diagnostico.js';

export const CONDICIONES = Object.freeze({
  referencia: { nombre: 'Referencia (montaje correcto)', corto: 'Referencia' },
  'ra-la': { nombre: 'Cables RA y LA intercambiados', corto: 'RA y LA intercambiados' },
  'ra-rl': { nombre: 'Cables RA y RL intercambiados', corto: 'RA y RL intercambiados' },
  'la-suelto': { nombre: 'Cable LA desenganchado', corto: 'LA desenganchado' },
});

const mismoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Condición del montaje, o null si no es ninguna de las de la práctica.
 * @param {object} montaje
 * @param {object} torax  resultado de crearTorax()
 * @returns {keyof typeof CONDICIONES | null}
 */
export function clasificarCondicion(montaje, torax) {
  const { correcto, errores } = diagnosticarMontaje(montaje, torax);
  if (correcto) return 'referencia';
  const unico = (tipo, entradas) => errores.length === 1 && errores[0].tipo === tipo && mismoConjunto(errores[0].entradas, entradas);
  if (unico('intercambio', ['RA', 'LA'])) return 'ra-la';
  if (unico('intercambio', ['RA', 'RL'])) return 'ra-rl';
  if (unico('sin-cable', ['LA'])) return 'la-suelto';
  return null;
}
