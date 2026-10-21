/**
 * ELECTRODOS, CABLES Y CÓDIGO DE COLORES (editable).
 *
 * El laboratorio usa el código de colores AHA (América), el mismo del cable de paciente del laboratorio
 * presencial: RA blanco, LA negro, LL rojo, RL verde. Las entradas del equipo se llaman RA, LA, LL, RL, V1…V6.
 * Fuente: manual del EDAN SE-601 (tabla 4-1) y póster de colocación de GE Healthcare.
 * En AHA los cables precordiales suelen ser marrones con una marca de color; aquí se dibujan del color de la marca.
 */
export const CABLES = Object.freeze({
  nombre: 'AHA',
  etiqueta: Object.freeze({ RA: 'RA', LA: 'LA', LL: 'LL', RL: 'RL', V1: 'V1', V2: 'V2', V3: 'V3', V4: 'V4', V5: 'V5', V6: 'V6' }),
  color: Object.freeze({
    RA: '#F4F4F0', LA: '#1D2224', LL: '#D0362B', RL: '#2E8B3E',
    V1: '#D0362B', V2: '#E3B505', V3: '#2E8B3E', V4: '#1F5FC2', V5: '#E2770D', V6: '#7A3FA6',
  }),
  nombreColor: Object.freeze({
    RA: 'blanco', LA: 'negro', LL: 'rojo', RL: 'verde',
    V1: 'rojo', V2: 'amarillo', V3: 'verde', V4: 'azul', V5: 'naranja', V6: 'violeta',
  }),
});

/** Etiqueta visible de una entrada (RA, LA…). */
export const etiquetaCable = (entrada) => CABLES.etiqueta[entrada] ?? entrada;

/** Zona anatómica donde debe ir cada electrodo. */
export const ZONA_ESPERADA = Object.freeze({
  RA: 'brazo_der', LA: 'brazo_izq', LL: 'pierna_izq', RL: 'pierna_der',
  V1: 'torso', V2: 'torso', V3: 'torso', V4: 'torso', V5: 'torso', V6: 'torso',
});

export const ENTRADAS_EXTREMIDADES = Object.freeze(['RA', 'LA', 'LL', 'RL']);
export const ENTRADAS_PRECORDIALES = Object.freeze(['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

export const NOMBRE_ZONA = Object.freeze({
  brazo_der: 'brazo derecho',
  brazo_izq: 'brazo izquierdo',
  pierna_der: 'pierna derecha',
  pierna_izq: 'pierna izquierda',
  torso: 'tórax',
});

/** Ubicación correcta en palabras (para la guía y la revisión del montaje). */
export const UBICACION_CORRECTA = Object.freeze({
  RA: 'brazo derecho (muñeca o antebrazo)',
  LA: 'brazo izquierdo (muñeca o antebrazo)',
  LL: 'pierna izquierda (tobillo o pierna)',
  RL: 'pierna derecha (tobillo o pierna)',
  V1: '4.º espacio intercostal, borde esternal derecho',
  V2: '4.º espacio intercostal, borde esternal izquierdo',
  V3: 'punto medio entre V2 y V4',
  V4: '5.º espacio intercostal, línea medioclavicular izquierda',
  V5: 'línea axilar anterior izquierda, en el plano horizontal de V4',
  V6: 'línea axilar media izquierda, en el plano horizontal de V4',
});

/** Electrodos disponibles en la bandeja (como en el laboratorio: 4 pinzas; se añaden 6 adhesivos para el tórax). */
export const ELECTRODOS_EN_BANDEJA = Object.freeze({ pinza: 4, adhesivo: 6 });

export const NOMBRE_TIPO = Object.freeze({ pinza: 'pinza', adhesivo: 'electrodo adhesivo' });
