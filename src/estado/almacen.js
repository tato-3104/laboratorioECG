/**
 * Estado central de la aplicación.
 *
 * Un único objeto describe todo lo que el estudiante puede cambiar (montaje, ajustes del equipo, datos del
 * paciente, avance del procedimiento, vista…). Las vistas se suscriben y se redibujan cuando cambia lo que les
 * interesa. Los datos grandes (señales y registros) viven fuera del estado: en el motor de adquisición y en el
 * archivo de registros del navegador (src/estado/archivo.js).
 */

/**
 * @template T
 * @param {T} inicial
 */
export function crearAlmacen(inicial) {
  let estado = inicial;
  const suscriptores = new Set();
  return {
    /** @returns {T} */
    obtener: () => estado,
    /**
     * Aplica un cambio parcial (objeto) o una función estado → estado nuevo.
     * @param {Partial<T>|((e: T) => T)} cambio
     */
    actualizar(cambio) {
      const nuevo = typeof cambio === 'function' ? cambio(estado) : { ...estado, ...cambio };
      if (nuevo === estado) return;
      const anterior = estado;
      estado = nuevo;
      for (const fn of suscriptores) fn(estado, anterior);
    },
    /** @param {(e: T, anterior: T) => void} fn */
    suscribir(fn) {
      suscriptores.add(fn);
      return () => suscriptores.delete(fn);
    },
  };
}

// La versión 2 usa su propia clave: no hereda montajes ni ajustes de la versión 1 abierta en el mismo navegador.
const CLAVE = 'laboratorio-ecg-virtual:v2';

/** Lee el estado guardado en este navegador (o null). Nunca falla. */
export function leerGuardado() {
  try {
    const texto = localStorage.getItem(CLAVE);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/** Guarda en este navegador las partes del estado que vale la pena recordar. Nunca falla. */
export function guardar(estado) {
  try {
    const { montaje, ajustes, paciente, vista, referencias, corazon, herramienta, derivacionSeleccionada, procedimiento, zonaMovil } = estado;
    localStorage.setItem(
      CLAVE,
      JSON.stringify({ montaje, ajustes, paciente, vista, referencias, corazon, herramienta, derivacionSeleccionada, procedimiento, zonaMovil }),
    );
  } catch {
    /* almacenamiento no disponible: la aplicación funciona igual */
  }
}

/** Borra el estado guardado (botón «Borrar todo y empezar de nuevo»). Nunca falla. */
export function borrarGuardado() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}
