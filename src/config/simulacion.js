/**
 * RUIDO E INTERFERENCIAS (editable). Valores ILUSTRATIVOS: en la realidad dependen del equipo,
 * de los electrodos y del entorno. Se eligieron para que los efectos sean visibles y proporcionados.
 * Documento de referencia: docs/04-modelo-de-simulacion.md, §7.
 *
 * En la versión 2 las condiciones del registro son fijas: el sujeto está relajado (sin actividad muscular)
 * y la piel está preparada (limpia con alcohol), como pide el procedimiento del laboratorio.
 */
export const RUIDO = {
  amplificadorMV: 0.004, // ruido blanco del amplificador por entrada (mV eficaces)

  // Potencial de media celda de cada electrodo (mV). Las diferencias entre electrodos generan un
  // desplazamiento de línea de base que el filtro paso alto elimina en unos segundos.
  offsetElectrodoMV: [0.3, 1.2],

  // Deriva de la línea de base: componente respiratoria + deriva lenta aleatoria (mV).
  derivaRespiratoriaMV: { torso: 0.05, extremidad: 0.012 },
  derivaLentaMV: 0.02,
  derivaLentaTauS: 4,

  // Impedancia electrodo–piel con la piel preparada (kΩ): media y desviación entre electrodos.
  impedanciaKOhm: [10, 3],

  // Interferencia de la red eléctrica.
  red: {
    corrienteCableNA: 4, // corriente de desplazamiento inducida en cada cable (nA)
    variacionCable: 0.5, // ±50 % entre cables
    tensionModoComunConRLmV: 5, // con RL el cuerpo queda cerca de la referencia del amplificador
    tensionModoComunSinRLmV: 3000, // sin RL el cuerpo «flota» y acopla varios voltios de la red
    impedanciaModoComunMOhm: 10,
    cmrrDb: 100,
    // La frecuencia de la red no es exactamente 60 Hz: se desvía unas centésimas de hercio y cambia despacio.
    // Por eso el filtro de ranura, muy estrecho, no la elimina por completo.
    desviacionHz: { media: 0.03, variacion: 0.02, periodoS: 40 },
    // Armónicos (fracción del fundamental). El acoplamiento capacitivo crece con la frecuencia, así que
    // los armónicos de la tensión de red pesan más en la interferencia que en la propia red.
    tercerArmonico: 0.15,
    quintoArmonico: 0.05,
  },
};
