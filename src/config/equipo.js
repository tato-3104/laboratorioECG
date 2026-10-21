/**
 * ELECTROCARDIÓGRAFO VIRTUAL (editable).
 *
 * Equipo genérico inspirado en un electrocardiógrafo diagnóstico de 6 canales y 12 derivaciones.
 * Valores habituales de este tipo de equipos (folleto y manual del EDAN SE-601; recomendaciones AHA 2007).
 */
export const EQUIPO = {
  frecuenciaMuestreo: 500, // Hz (AHA: 500 muestras/s para un ancho de banda de 150 Hz)
  duracionBufferS: 30, // segundos que el equipo conserva para congelar, imprimir y medir
  rangoEntradaMV: 5, // se recorta la señal por encima de ±5 mV (rango de entrada del amplificador)

  velocidades: [12.5, 25, 50], // mm/s
  ganancias: [5, 10, 20], // mm/mV
  formatos: [
    { id: '6x2', nombre: '12 derivaciones (6×2)' },
    { id: 'extremidades', nombre: 'I, II, III, aVR, aVL, aVF' },
    { id: 'precordiales', nombre: 'V1 a V6' },
    { id: 'una', nombre: 'Una derivación' },
  ],

  /**
   * FILTROS FIJOS (modo diagnóstico). El estudiante no los puede cambiar; la pantalla y cada registro los indican.
   *  pasoAlto  Hz, 1.er orden: quita la deriva lenta de la línea de base (τ = 1/2πf ≈ 3,2 s) sin deformar el ST.
   *  pasoBajo  Hz, Butterworth de 2.º orden: ancho de banda diagnóstico para adultos (AHA 2007).
   *  ranura    Hz, filtro de la red eléctrica (Colombia: 60 Hz). Q = selectividad.
   * El filtro EMG no se usa: el sujeto está relajado y ese filtro reduce la amplitud del QRS.
   */
  filtros: { pasoAlto: 0.05, pasoBajo: 150, ranura: 60, ranuraQ: 30 },

  /** Ajustes con los que arranca el equipo (apagado: el estudiante lo enciende en el paso 2). */
  ajustesIniciales: {
    encendido: false,
    velocidad: 25,
    ganancia: 10,
    formato: '6x2',
    derivacionUnica: 'II',
  },

  /** Segundos que tarda el equipo en iniciar al encenderlo. */
  arranqueS: 1.5,

  /**
   * Comportamiento cuando falta el electrodo de referencia RL. Depende del equipo real:
   *  'interferencia' → el equipo avisa y sigue registrando, con más interferencia de red (valor usado);
   *  'invalidar'     → el equipo avisa y no registra ninguna derivación.
   * Si el equipo del laboratorio presencial se comporta distinto, cambie este valor y regenere el archivo único.
   */
  perfilRL: 'interferencia',

  /**
   * Detector de QRS para la frecuencia cardíaca automática. Combina varias derivaciones (como los equipos de
   * 12 derivaciones), de modo que una derivación casi plana por un error de conexión no altera la FC.
   */
  detector: {
    derivaciones: ['I', 'II', 'III', 'V2', 'V5'],
    latidosPromedio: 4, // la FC mostrada es el promedio de los últimos R–R
  },

  duracionImpresionS: 10, // página de 12 derivaciones (6×2): 5 s de extremidades + 5 s de precordiales
  duracionRitmoS: 20, // cada registro guarda 20 s: la tira de ritmo de la segunda página
};

/** Texto de los filtros fijos (pantalla, registros y guía). */
export function textoFiltros(f = EQUIPO.filtros) {
  const coma = (v) => String(v).replace('.', ',');
  return `paso alto ${coma(f.pasoAlto)} Hz · paso bajo ${f.pasoBajo} Hz · ranura ${f.ranura} Hz`;
}
