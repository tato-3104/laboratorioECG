/**
 * PARÁMETROS DEL SUJETO VIRTUAL (editable).
 *
 * El corazón se representa con un dipolo equivalente H(t) = [Hx, Hy, Hz] en mV, en las coordenadas
 * de Frank que usa la matriz de Dower:
 *    X+ hacia la IZQUIERDA del paciente,  Y+ hacia los PIES,  Z+ hacia la ESPALDA.
 *
 * Cada onda se construye con pulsos de soporte compacto (src/modelo/pulsos.js). Para cada componente:
 *   vector    amplitud de pico [X, Y, Z] en mV (dirección y tamaño de esa fase de la activación)
 *   inicio    s, medido desde el inicio de su onda (inicio de P o inicio del QRS)
 *   duracion  s
 *   a, b      forma del pulso (a = b simétrico; a > b sube despacio y baja rápido)
 *
 * Con estos valores, POR CONSTRUCCIÓN: P = 100 ms, QRS = 90 ms, y PR y QT son exactamente los indicados.
 * Si cambia los tiempos, ejecute las pruebas (`npm test`): verifican intervalos, ejes y amplitudes.
 * El sujeto del laboratorio (config/voluntarios.js) se construye a partir de este sujeto de referencia.
 *
 * Fuente del método: documento docs/04-modelo-de-simulacion.md (§3). Los valores se ajustaron para
 * reproducir un ECG normal de 12 derivaciones (V1 rS con P bifásica, transición en V3, V5–V6 qR,
 * aVR negativa, T pequeña en DIII; ejes P ≈ +60°, QRS ≈ +58°, T ≈ +42°).
 */
export const SUJETO_REFERENCIA = {
  sexo: 'hombre',
  edad: 21,
  fc: 68,                       // frecuencia cardíaca media (latidos/min)
  variabilidadRR: 0.035,        // desviación característica del intervalo R–R (s)
  frecuenciaRespiratoria: 0.25, // Hz (15 respiraciones/min); module el ritmo y la línea de base
  pr: 0.160,                    // intervalo PR (s): inicio de P → inicio del QRS
  qtc: 0.410,                   // QT corregido de Bazett del sujeto (s)
  fraccionT: 0.45,              // duración de la onda T como fracción del QT

  ondaP: [
    { nombre: 'Aurícula derecha', vector: [0.08, 0.10, -0.08], inicio: 0.000, duracion: 0.075, a: 2, b: 2 },
    { nombre: 'Aurícula izquierda', vector: [0.14, 0.04, 0.05], inicio: 0.025, duracion: 0.075, a: 2, b: 2 },
  ],
  complejoQRS: [
    { nombre: 'Tabique (activación inicial)', vector: [-0.12, 0.06, -0.20], inicio: 0.000, duracion: 0.026, a: 2, b: 2 },
    { nombre: 'Ápex y región anteroseptal', vector: [0.40, 0.35, -0.35], inicio: 0.012, duracion: 0.036, a: 2, b: 2 },
    { nombre: 'Pared libre del ventrículo izquierdo', vector: [1.10, 0.72, 0.70], inicio: 0.022, duracion: 0.048, a: 2, b: 2 },
    { nombre: 'Regiones basales (fuerzas terminales)', vector: [-0.15, -0.12, 0.50], inicio: 0.046, duracion: 0.044, a: 2, b: 2 },
  ],
  ondaT: { nombre: 'Repolarización ventricular', vector: [0.46, 0.16, -0.22], a: 3, b: 2 },

  // Con la respiración el corazón rota levemente: la amplitud del QRS varía un poco, como en registros reales.
  modulacionRespiratoria: { rotacionGrados: 2.0, amplitudRelativa: 0.03 },
};
