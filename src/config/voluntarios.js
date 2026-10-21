/**
 * SUJETO VIRTUAL DEL LABORATORIO (editable).
 *
 * Todos los estudiantes registran al mismo sujeto: un hombre sano de 21 años. Así las respuestas numéricas
 * (frecuencia cardíaca, intervalos, amplitudes, eje) son las mismas para todos y la guía del docente las
 * tiene calculadas (`npm run referencias`).
 *
 * La estructura admite varios sujetos: basta con agregar entradas a la lista y volver a mostrar un selector
 * en el diálogo «Paciente» (ver docs/08-version-2.md). Hoy la interfaz usa solo el primero.
 *
 * El sujeto se construye a partir del sujeto de referencia (config/sujetos.js):
 *   fc, pr, qtc         frecuencia cardíaca media (lpm), intervalo PR (s) y QTc de Bazett (s) por construcción.
 *                       El QT que se mide sobre el papel resulta algo menor que el de construcción, porque el
 *                       final de la onda T se confunde con la línea de base (la guía del docente lo tiene en cuenta).
 *   variabilidadRR      variación característica del R–R (s): arritmia sinusal respiratoria y ondas lentas.
 *   frecuenciaRespiratoria  Hz.
 *   rotacionQRS/T/P     grados en el plano frontal (+ hacia los pies: aumenta el eje).
 *   escalaQRS/T/P       factor de amplitud.
 *   semilla             fija la variabilidad del ritmo, el ruido y la interferencia: el sujeto se comporta igual
 *                       en todos los computadores.
 */
export const VOLUNTARIOS = Object.freeze([
  {
    id: 1, sexo: 'hombre', edad: 21,
    fc: 68, pr: 0.160, qtc: 0.410, variabilidadRR: 0.035, frecuenciaRespiratoria: 0.25,
    rotacionQRS: 0, rotacionT: 0, rotacionP: 0, escalaQRS: 1.0, escalaT: 1.0, escalaP: 1.0,
    semilla: 1101,
  },
]);

export const VOLUNTARIO_POR_DEFECTO = 1;

/** Sujeto por número; si no existe, el sujeto del laboratorio. */
export function buscarVoluntario(id) {
  const n = Number(id);
  return VOLUNTARIOS.find((v) => v.id === n) ?? VOLUNTARIOS.find((v) => v.id === VOLUNTARIO_POR_DEFECTO);
}

/** Descripción breve: «hombre, 21 años». */
export function describirVoluntario(v) {
  return `${v.sexo}, ${v.edad} años`;
}
