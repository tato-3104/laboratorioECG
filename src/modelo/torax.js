/**
 * Tórax: geometría (espacios intercostales, líneas de referencia, posiciones precordiales) y
 * campo de vectores de derivación sobre la pared torácica (docs/04, §4.4).
 *
 * Campo torácico:  L(r) = g(r) + c(r)
 *   g(r) = k · (r − r_h) / (|r − r_h|² + a²)^(3/2)   dipolo equivalente en medio homogéneo
 *   c(r) = Σ_j w_j · exp(−|r − r_j|² / 2ℓ²)           corrección suave, exacta en las 6 posiciones normalizadas
 * r_h, a y k se ajustan por mínimos cuadrados a los vectores de Dower de V1–V6.
 * Fuera de las posiciones normalizadas el resultado es una APROXIMACIÓN cualitativa.
 */
import { TORAX } from '../config/anatomia.js';
import { MATRIZ_DOWER, PRECORDIALES } from './vectoresDerivacion.js';
import { levenbergMarquardt, resolverSistema, coseno } from './algebra.js';

/**
 * Crea las funciones geométricas del tórax.
 * @param {typeof TORAX} [g]
 */
export function crearTorax(g = TORAX) {
  /** Desplazamiento vertical del espacio intercostal según la distancia lateral |x| (cm). */
  function desnivel(ax) {
    if (ax <= g.xMedioclavicular) return g.pendienteMedial * ax;
    return g.pendienteMedial * g.xMedioclavicular - g.subidaLateral * (ax - g.xMedioclavicular);
  }

  /** Altura (cm) del centro del n-ésimo espacio intercostal en la posición lateral x. */
  function yEIC(n, x) {
    return (n - 4) * g.pasoEIC + desnivel(Math.abs(x));
  }

  /** Altura (cm) del centro de la k-ésima costilla (encima del k-ésimo espacio intercostal). */
  function yCostilla(k, x) {
    return yEIC(k, x) - g.pasoEIC / 2;
  }

  /** Número (fraccionario) de espacio intercostal en (x, y): 4,0 = centro del 4.º EIC; 4,5 = 5.ª costilla. */
  function numeroEIC(x, y) {
    return 4 + (y - desnivel(Math.abs(x))) / g.pasoEIC;
  }

  /** Posiciones normalizadas de V1–V6 (AHA/ACCF/HRS 2007). */
  const yV1 = yEIC(4, g.xParaesternal);
  const yV4 = yEIC(5, g.xMedioclavicular);
  const posicionesEstandar = {
    V1: { x: -g.xParaesternal, y: yV1 },
    V2: { x: g.xParaesternal, y: yV1 },
    V4: { x: g.xMedioclavicular, y: yV4 },
    V5: { x: g.xAxilarAnterior, y: yV4 }, // mismo plano horizontal que V4
    V6: { x: g.xAxilarMedia, y: yV4 },
  };
  posicionesEstandar.V3 = {
    x: (posicionesEstandar.V2.x + posicionesEstandar.V4.x) / 2,
    y: (posicionesEstandar.V2.y + posicionesEstandar.V4.y) / 2,
  };

  /** Punto 3D (cm) de la superficie anterior del tórax (cilindro elíptico). z+ hacia la espalda. */
  function puntoSuperficie(x, y) {
    const xc = Math.max(-g.semiancho, Math.min(g.semiancho, x));
    const z = -g.semiprofundidad * Math.sqrt(Math.max(0, 1 - (xc / g.semiancho) ** 2));
    return [xc, y, z];
  }

  /** ¿Se acepta un electrodo de tórax en (x, y)? */
  function dentroRegion(x, y) {
    return Math.abs(x) <= g.region.xMax && y >= g.region.yMin && y <= g.region.yMax;
  }

  /**
   * Describe en palabras una posición del tórax (para lectores de pantalla, el panel de ecuaciones
   * y los mensajes). Lado = lado del PACIENTE.
   */
  function describir(x, y) {
    const lado = x > 0 ? 'izquierdo' : 'derecho';
    const ladoF = x > 0 ? 'izquierda' : 'derecha';
    const ax = Math.abs(x);
    let linea;
    if (ax < g.xBordeEsternal) linea = 'sobre el esternón';
    else if (ax < g.xBordeEsternal + 1.6) linea = `borde esternal ${lado}`;
    else if (Math.abs(ax - g.xMedioclavicular) <= 1.2) linea = `línea medioclavicular ${ladoF}`;
    else if (Math.abs(ax - g.xAxilarAnterior) <= 1.0) linea = `línea axilar anterior ${ladoF}`;
    else if (ax >= g.xAxilarMedia - 0.9) linea = `línea axilar media ${ladoF}`;
    else linea = `${formatoCm(ax)} cm a la ${ladoF} de la línea media`;
    const n = numeroEIC(x, y);
    const nRed = Math.round(n);
    let nivel;
    if (n < 1.4) nivel = 'por encima del 2.º espacio intercostal (zona clavicular)';
    else if (Math.abs(n - nRed) <= 0.3) nivel = `${nRed}.º espacio intercostal`;
    else nivel = `sobre la ${Math.floor(n) + 1}.ª costilla`;
    return { texto: `${nivel}, ${linea}`, eic: n, linea, nivel };
  }

  return { g, desnivel, yEIC, yCostilla, numeroEIC, posicionesEstandar, puntoSuperficie, dentroRegion, describir };
}

function formatoCm(v) {
  return v.toFixed(1).replace('.', ',');
}

/**
 * Crea el campo de vectores de derivación del tórax, calibrado con Dower.
 * @param {ReturnType<typeof crearTorax>} torax
 */
export function crearCampoToracico(torax) {
  const g = torax.g;
  const nombres = PRECORDIALES;
  const puntos = nombres.map((v) => torax.puntoSuperficie(torax.posicionesEstandar[v].x, torax.posicionesEstandar[v].y));
  const objetivo = nombres.map((v) => MATRIZ_DOWER[v]);

  const campoDipolo = (r, rh, a, k) => {
    const d0 = r[0] - rh[0];
    const d1 = r[1] - rh[1];
    const d2 = r[2] - rh[2];
    const den = Math.pow(d0 * d0 + d1 * d1 + d2 * d2 + a * a, 1.5);
    return [(k * d0) / den, (k * d1) / den, (k * d2) / den];
  };

  // 1) Ajuste del dipolo equivalente por mínimos cuadrados.
  const ini = g.campo.inicial;
  const residuos = (p) => {
    const out = [];
    puntos.forEach((r, i) => {
      const v = campoDipolo(r, [p[0], p[1], p[2]], p[3], p[4]);
      out.push(v[0] - objetivo[i][0], v[1] - objetivo[i][1], v[2] - objetivo[i][2]);
    });
    return out;
  };
  const limites = (p) => [p[0], p[1], p[2], Math.max(0.5, p[3]), Math.max(1, p[4])];
  const ajuste = levenbergMarquardt(residuos, [...ini.centro, ini.suavizado, ini.ganancia], { limites });
  const [hx, hy, hz, a, k] = ajuste.p;
  const rh = [hx, hy, hz];

  // 2) Corrección suave (funciones de base radial gaussianas) para que el campo sea exacto en V1–V6.
  const ell = g.campo.escalaCorreccionCm;
  const nucleo = (p, q) => {
    const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    return Math.exp(-d2 / (2 * ell * ell));
  };
  const K = puntos.map((p) => puntos.map((q) => nucleo(p, q)));
  const resto = puntos.map((r, i) => {
    const v = campoDipolo(r, rh, a, k);
    return [objetivo[i][0] - v[0], objetivo[i][1] - v[1], objetivo[i][2] - v[2]];
  });
  const pesos = resolverSistema(K, resto);

  /** Vector de derivación (respecto al TCW) de un electrodo de tórax en (x, y) cm. */
  function vectorEn(x, y) {
    const r = torax.puntoSuperficie(x, y);
    const v = campoDipolo(r, rh, a, k);
    for (let j = 0; j < puntos.length; j++) {
      const w = nucleo(r, puntos[j]);
      v[0] += w * pesos[j][0];
      v[1] += w * pesos[j][1];
      v[2] += w * pesos[j][2];
    }
    return v;
  }

  const similitud = {};
  nombres.forEach((v, i) => {
    similitud[v] = coseno(campoDipolo(puntos[i], rh, a, k), objetivo[i]);
  });

  return {
    vectorEn,
    parametros: { centro: rh, suavizado: a, ganancia: k, costo: ajuste.costo, iteraciones: ajuste.iteraciones },
    similitudDipoloDower: similitud,
  };
}
