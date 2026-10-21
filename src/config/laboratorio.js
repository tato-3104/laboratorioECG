/**
 * PRÁCTICA DE LABORATORIO (editable).
 *
 * Ajustes de la estructura de la práctica que el docente puede querer cambiar. Después de editar,
 * regenere el archivo único (`npm run construir`).
 */
export const LABORATORIO = {
  /**
   * Botón «Revisar montaje»: equivale a pedirle al docente que revise la colocación antes de registrar.
   *  habilitada  false lo oculta (por ejemplo, si se quiere que los estudiantes verifiquen solo con el trazado).
   *  detalles    false muestra solo cuántos problemas hay, sin decir cuáles.
   * Si se deshabilita, el paso «Revise el montaje» desaparece del procedimiento (quedan 18 pasos).
   */
  revisionMontaje: { habilitada: true, detalles: true },

  /** Registros que se conservan en el navegador (los más antiguos se descartan). */
  maxRegistros: 30,
};
