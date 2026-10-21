/**
 * GEOMETRÍA ANATÓMICA (editable con cuidado).
 *
 * Coordenadas del tórax en centímetros:
 *    x+ hacia la IZQUIERDA del paciente (derecha de quien mira la pantalla),
 *    y+ hacia los PIES,
 *    origen: línea media, a la altura del 4.º espacio intercostal junto al esternón.
 * El tórax se aproxima como un cilindro elíptico (superficie anterior).
 *
 * Si cambia estos valores, el campo torácico se recalibra solo con la matriz de Dower al iniciar
 * (src/modelo/torax.js) y las pruebas verifican que la calibración siga siendo buena.
 */
export const TORAX = {
  semiancho: 16, // cm (de la línea media a la línea axilar media)
  semiprofundidad: 11, // cm
  pasoEIC: 2.7, // separación vertical entre espacios intercostales junto al esternón (cm)
  // Forma de los espacios intercostales vistos de frente: bajan levemente desde el esternón hasta la
  // línea medioclavicular y luego SUBEN hacia la axila. Por eso V5 y V6 van en el plano horizontal de V4.
  pendienteMedial: 0.12, // cm de descenso por cm lateral (esternón → línea medioclavicular)
  subidaLateral: 0.35, // cm de ascenso por cm lateral (línea medioclavicular → axila)
  xBordeEsternal: 1.6, // semiancho del esternón a la altura del 4.º EIC (cm)
  xParaesternal: 2.2, // centro de V1/V2: justo por fuera del borde esternal (cm)
  xMedioclavicular: 9.5,
  xAxilarAnterior: 14.0,
  xAxilarMedia: 16.0,
  // Región donde se aceptan electrodos de tórax (pared torácica anterior y lateral).
  region: { xMax: 16.5, yMin: -10.5, yMax: 17.0 },
  // Calibración del campo torácico (docs/04, §4.4). Valores iniciales del ajuste; se recalculan al iniciar.
  campo: {
    escalaCorreccionCm: 6,
    inicial: { centro: [1.53, 0.73, -3.99], suavizado: 10.47, ganancia: 381.5 },
  },
  // Tolerancia para considerar bien ubicado un electrodo precordial (cm).
  toleranciaPrecordialCm: 1.5,
};

/**
 * VISTA DE CUERPO COMPLETO (coordenadas del SVG, viewBox 0 0 320 640).
 * El paciente se dibuja de frente: su derecha queda a la IZQUIERDA de la pantalla.
 * Las extremidades son "cápsulas": segmentos con un radio. Sirven para dibujar y para saber
 * en qué zona cae un electrodo.
 */
export const VISTA_CUERPO = {
  ancho: 320,
  alto: 640,
  // Conversión tórax (cm) → SVG: u = origen[0] + escala·x ; v = origen[1] + escala·y
  origenTorax: [150, 150],
  escalaTorax: 3.45,
  cabeza: { cx: 150, cy: 52, r: 31 },
  cuello: { x: 137, y: 78, ancho: 26, alto: 30 },
  tronco:
    'M150 100 C120 100 97 105 90 118 C86 140 96 170 100 200 C104 240 108 262 106 290 ' +
    'C104 310 100 326 104 342 Q150 358 196 342 C200 326 196 310 194 290 C192 262 196 240 200 200 ' +
    'C204 170 214 140 210 118 C203 105 180 100 150 100 Z',
  // Polígono aproximado del tronco para la prueba de pertenencia (sentido horario).
  troncoPoligono: [
    [150, 100], [118, 102], [96, 108], [89, 122], [90, 145], [96, 175], [100, 200], [104, 235],
    [107, 262], [106, 290], [103, 315], [103, 342], [150, 354], [197, 342], [197, 315], [194, 290],
    [193, 262], [196, 235], [200, 200], [204, 175], [210, 145], [211, 122], [204, 108], [182, 102],
  ],
  extremidades: {
    brazo_der: { tramos: [[[92, 126], [78, 228], 13.5], [[78, 228], [65, 316], 12.5]], mano: { cx: 61, cy: 340, rx: 10, ry: 17 } },
    brazo_izq: { tramos: [[[208, 126], [222, 228], 13.5], [[222, 228], [235, 316], 12.5]], mano: { cx: 239, cy: 340, rx: 10, ry: 17 } },
    pierna_der: { tramos: [[[127, 332], [125, 450], 20.5], [[125, 450], [127, 556], 15.5]], pie: { cx: 127, cy: 576, rx: 14, ry: 10 } },
    pierna_izq: { tramos: [[[173, 332], [175, 450], 20.5], [[175, 450], [173, 556], 15.5]], pie: { cx: 173, cy: 576, rx: 14, ry: 10 } },
  },
  // Sitios habituales para las pinzas (muñecas y tobillos, como en el procedimiento del laboratorio).
  sitiosPinza: {
    brazo_der: [64, 314],
    brazo_izq: [236, 314],
    pierna_der: [127, 540],
    pierna_izq: [173, 540],
  },
  horquilla: [282, 266], // donde se reúnen los cables del paciente
};

/**
 * VISTA AMPLIADA DEL TÓRAX (coordenadas del SVG; el dibujo completo mide 640 × 600).
 * Conversión: u = origen[0] + escala·x ; v = origen[1] + escala·y (x, y en cm).
 * Solo se muestra el «recorte» (en cm): la pared anterior izquierda y la derecha hasta pasada la línea
 * medioclavicular, que es donde van las precordiales. Así la vista se ve más grande en la columna del paciente.
 */
export const VISTA_TORAX = {
  ancho: 640,
  alto: 600,
  origen: [320, 223],
  escala: 14,
  recorte: { x: -13, y: -13, ancho: 32, alto: 28 },
  contorno:
    'M286 18 C286 44 270 56 236 62 C180 72 120 78 96 104 C84 120 84 150 92 190 C98 260 96 380 102 600 ' +
    'L538 600 C544 380 542 260 548 190 C556 150 556 120 544 104 C520 78 460 72 404 62 C370 56 354 44 354 18 Z',
  horquilla: [586, 312],
};
