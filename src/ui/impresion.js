/**
 * Registro «impreso»: páginas en papel milimetrado a escala real (carta horizontal, 279,4 × 215,9 mm).
 *   Página 1: 12 derivaciones en formato 6×2 (columna izquierda: extremidades; derecha: precordiales,
 *             a continuación en el tiempo, como en los equipos de 6 canales) y una tira de ritmo.
 *   Página 2: tira de ritmo de todo el registro, con marcas de segundo.
 * Velocidad y ganancia son las que tenía el equipo al imprimir.
 */
import { svgEl, el, vaciar, $, num, avisar } from './dom.js';
import { cuadricula, trazo, pulsoCalibracion, texto, marcasDeTiempo, COLORES_PAPEL } from './papel.js';
import { GRUPO_EXTREMIDADES, GRUPO_PRECORDIALES } from '../modelo/derivaciones.js';
import { textoFiltros } from '../config/equipo.js';
import { buscarVoluntario } from '../config/voluntarios.js';

export const PAGINA = Object.freeze({ ancho: 279.4, alto: 215.9 });
const AREA = Object.freeze({ x: 6, y: 30, ancho: 267.4, alto: 168 });
const X_PULSO = 8; // mm
const X_TRAZO = 21; // mm (deja sitio al pulso de calibración incluso a 50 mm/s)
const ANCHO_COLUMNA = 125; // mm
const ANCHO_RITMO = 250; // mm

/** Derivación de la tira de ritmo: la elegida si el equipo estaba en «una derivación»; si no, II. */
export function derivacionDeRitmo(registro) {
  return registro.ajustes.formato === 'una' ? registro.ajustes.derivacionUnica : 'II';
}

function hayDatos(x, i0, i1) {
  for (let i = Math.max(0, i0); i < Math.min(x.length, i1); i += 10) if (Number.isFinite(x[i])) return true;
  return false;
}

function textoPaciente(r) {
  const v = buscarVoluntario(r.voluntario);
  const fecha = new Date(r.fecha).toLocaleDateString('es-CO');
  const nombre = r.estudiante || 'sin nombre';
  const estudiante = nombre.length > 36 ? `${nombre.slice(0, 35)}…` : nombre;
  return `Sujeto: ${v.sexo}, ${v.edad} años · Estudiante: ${estudiante} · ${fecha} ${r.hora}`;
}

function encabezado(svg, r, titulo) {
  svg.append(
    texto(AREA.x, 11, titulo, { tamano: 4, peso: 600, color: COLORES_PAPEL.trazo }),
    texto(AREA.x, 17, textoPaciente(r), { tamano: 3 }),
    texto(
      AREA.x,
      23,
      `FC ${r.fc ? `${Math.round(r.fc)} lpm` : '---'} · ${num(r.ajustes.velocidad, r.ajustes.velocidad % 1 ? 1 : 0)} mm/s · ${r.ajustes.ganancia} mm/mV · Filtros: ${textoFiltros()}`,
      { tamano: 3 },
    ),
    texto(AREA.x + AREA.ancho, 11, 'SEÑAL SINTÉTICA · USO EDUCATIVO · NO DIAGNÓSTICO', { tamano: 3, peso: 600, ancla: 'end' }),
  );
  if (r.montajeResumen) svg.append(texto(AREA.x + AREA.ancho, 17, r.montajeResumen, { tamano: 2.6, ancla: 'end', color: COLORES_PAPEL.tenue }));
  if (r.numero && !r.uniforme) svg.append(texto(AREA.x + AREA.ancho, 23, 'Incluye un cambio de conexión durante el registro', { tamano: 2.6, ancla: 'end', color: COLORES_PAPEL.tenue }));
}

function pie(svg, pagina, total) {
  svg.append(
    texto(AREA.x, 206, 'Laboratorio virtual de electrocardiografía · Sistemas fisiológicos — Universidad Tecnológica de Pereira', { tamano: 2.4, color: COLORES_PAPEL.tenue }),
    texto(AREA.x, 210.5, 'Señal generada por un modelo matemático; no corresponde a un paciente real ni sirve para diagnóstico.', { tamano: 2.4, color: COLORES_PAPEL.tenue }),
    texto(AREA.x + AREA.ancho, 206, `Página ${pagina} de ${total}`, { tamano: 2.4, color: COLORES_PAPEL.tenue, ancla: 'end' }),
  );
}

function nuevaPagina(etiqueta) {
  // (XMLSerializer añade por sí mismo xmlns="http://www.w3.org/2000/svg" al exportar)
  return svgEl('svg', {
    viewBox: `0 0 ${PAGINA.ancho} ${PAGINA.alto}`,
    width: `${PAGINA.ancho}mm`,
    height: `${PAGINA.alto}mm`,
    role: 'img',
    'aria-label': etiqueta,
  });
}

/**
 * Dibuja una derivación en una fila: etiqueta, trazo (o «sin señal»).
 */
function tira(svg, r, d, i0, i1, x0, yBase, yEtiqueta) {
  const a = r.ajustes;
  const x = r.derivaciones[d];
  svg.append(texto(x0 + 1, yEtiqueta, d, { tamano: 3.2, peso: 600, color: COLORES_PAPEL.trazo }));
  if (i1 <= 0) return; // el registro es más corto que la ventana: esa parte del papel queda en blanco
  if (!x || !hayDatos(x, i0, i1)) {
    const largo = ((i1 - i0) / r.fs) * a.velocidad;
    svg.append(
      svgEl('path', { d: `M${x0} ${yBase}h${largo.toFixed(2)}`, stroke: COLORES_PAPEL.tenue, 'stroke-width': 0.25, 'stroke-dasharray': '1.5 1.5', fill: 'none' }),
      texto(x0 + 12, yBase - 1.5, 'sin señal', { tamano: 2.6, color: COLORES_PAPEL.tenue }),
    );
    return;
  }
  const dTrazo = trazo(x, i0, i1, r.fs, { x0, yBase, mmPorS: a.velocidad, mmPorMV: a.ganancia });
  svg.append(svgEl('path', { d: dTrazo, fill: 'none', stroke: COLORES_PAPEL.trazo, 'stroke-width': 0.3, 'stroke-linejoin': 'round' }));
}

/** Página 1: 12 derivaciones (6×2) y tira de ritmo. */
export function pagina12Derivaciones(r) {
  const a = r.ajustes;
  const svg = nuevaPagina(`Registro ${r.numero ?? ''}: 12 derivaciones`);
  svg.append(cuadricula(AREA.x, AREA.y, AREA.ancho, AREA.alto));
  encabezado(svg, r, `Laboratorio virtual de ECG · ${r.etiqueta}`);
  const nCol = Math.round((ANCHO_COLUMNA / a.velocidad) * r.fs);
  const fin = r.n;
  const filas = 6;
  const altoFila = 22;
  for (let i = 0; i < filas; i++) {
    const top = AREA.y + 2 + i * altoFila;
    const base = top + 13;
    svg.append(pulsoCalibracion(X_PULSO, base, a.velocidad, a.ganancia));
    tira(svg, r, GRUPO_EXTREMIDADES[i], fin - 2 * nCol, fin - nCol, X_TRAZO, base, top + 3.5);
    tira(svg, r, GRUPO_PRECORDIALES[i], fin - nCol, fin, X_TRAZO + ANCHO_COLUMNA, base, top + 3.5);
    svg.append(svgEl('path', { d: `M${X_TRAZO + ANCHO_COLUMNA} ${base - 2.5}v5`, stroke: COLORES_PAPEL.trazo, 'stroke-width': 0.3 }));
  }
  // Tira de ritmo
  const dR = derivacionDeRitmo(r);
  const nR = Math.round((ANCHO_RITMO / a.velocidad) * r.fs);
  const topR = AREA.y + 2 + filas * altoFila + 2;
  const baseR = topR + 17;
  svg.append(pulsoCalibracion(X_PULSO, baseR, a.velocidad, a.ganancia));
  tira(svg, r, dR, fin - nR, fin, X_TRAZO, baseR, topR + 3.5);
  svg.append(texto(X_TRAZO + ANCHO_RITMO, topR + 3.5, `Ritmo · ${num(ANCHO_RITMO / a.velocidad, 1)} s`, { tamano: 2.6, ancla: 'end', color: COLORES_PAPEL.tenue }));
  pie(svg, 1, 2);
  return svg;
}

/** Página 2: tira de ritmo de todo el registro, en filas de 250 mm. */
export function paginaRitmo(r) {
  const a = r.ajustes;
  const dR = derivacionDeRitmo(r);
  const svg = nuevaPagina(`Registro ${r.numero ?? ''}: tira de ritmo de ${dR}`);
  svg.append(cuadricula(AREA.x, AREA.y, AREA.ancho, AREA.alto));
  encabezado(svg, r, `Tira de ritmo · derivación ${dR} · ${num(r.duracion, 0)} s`);
  const porFila = Math.round((ANCHO_RITMO / a.velocidad) * r.fs);
  const filas = Math.min(4, Math.ceil(r.n / porFila));
  for (let j = 0; j < filas; j++) {
    const top = AREA.y + 2 + j * 41;
    const base = top + 24;
    const i0 = j * porFila;
    svg.append(pulsoCalibracion(X_PULSO, base, a.velocidad, a.ganancia));
    tira(svg, r, dR, i0, i0 + porFila, X_TRAZO, base, top + 3.5);
    svg.append(marcasDeTiempo(X_TRAZO, top + 34, ANCHO_RITMO / a.velocidad, a.velocidad, (i0 / r.fs)));
  }
  pie(svg, 2, 2);
  return svg;
}

export function paginasDelRegistro(r) {
  return [pagina12Derivaciones(r), paginaRitmo(r)];
}

/** Exporta las páginas a una sola imagen PNG (150 ppp) y la descarga. */
async function descargarPNG(paginas, nombre) {
  const ppmm = 150 / 25.4;
  const W = Math.round(PAGINA.ancho * ppmm);
  const H = Math.round(PAGINA.alto * ppmm);
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H * paginas.length;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  for (let i = 0; i < paginas.length; i++) {
    const xml = new XMLSerializer().serializeToString(paginas[i]);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.drawImage(img, 0, i * H, W, H);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('No se pudo generar la imagen.');
  const enlace = el('a', { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
}

/**
 * Diálogo del registro impreso.
 * @param {{alMedir: (id: string) => void}} op
 */
export function crearImpresion({ alMedir }) {
  const dlg = $('dlg-registro');
  const contenedor = $('registro-paginas');
  let actual = null;
  let paginas = [];

  $('btn-reg-cerrar').addEventListener('click', () => dlg.close());
  $('btn-reg-analizar').addEventListener('click', () => {
    dlg.close();
    if (actual) alMedir(actual.id);
  });
  // «Guardar como PDF»: se imprime una copia de las páginas fuera del diálogo (los diálogos modales no se
  // imprimen bien) y el CSS de impresión oculta todo lo demás; el navegador ofrece guardar como PDF.
  $('btn-reg-pdf').addEventListener('click', () => {
    const destino = $('impresion');
    vaciar(destino).append(...paginasDelRegistro(actual));
    document.documentElement.classList.add('imprimiendo');
    dlg.close();
    const terminar = () => {
      window.removeEventListener('afterprint', terminar);
      document.documentElement.classList.remove('imprimiendo');
      vaciar(destino);
      if (!dlg.open) dlg.showModal();
    };
    window.addEventListener('afterprint', terminar);
    window.print();
  });
  $('btn-reg-png').addEventListener('click', async () => {
    try {
      const nombre = `registro-ecg-${actual.numero ?? 'pantalla'}-${(actual.etiqueta || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`;
      await descargarPNG(paginas, `${nombre.replace(/-$/, '')}.png`);
    } catch {
      avisar('No se pudo generar la imagen en este navegador.');
    }
  });

  return {
    /** Muestra un registro como papel impreso. */
    abrir(registro, aviso = '') {
      actual = registro;
      paginas = paginasDelRegistro(registro);
      vaciar(contenedor).append(...paginas);
      $('t-dlg-registro').textContent = `${registro.etiqueta} · ${registro.hora}`;
      $('aviso-registro').textContent = aviso;
      $('aviso-registro').hidden = !aviso;
      if (!dlg.open) dlg.showModal();
      contenedor.scrollTop = 0;
    },
  };
}
