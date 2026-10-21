/**
 * Herramienta «Registros»: registros impresos (ver, medir, renombrar, eliminar) y comparación de dos
 * registros en una misma derivación, superpuestos o uno sobre otro.
 * Los registros se guardan en el navegador (src/estado/archivo.js): sobreviven a una recarga de la página,
 * pero no pasan a otro computador. Para el informe, se descargan en PNG o PDF desde «Ver».
 */
import { el, svgEl, vaciar, $, num, anunciar } from './dom.js';
import { cuadricula, trazo, texto, pulsoCalibracion, COLORES_PAPEL } from './papel.js';
import { DERIVACIONES } from '../modelo/derivaciones.js';
import { TEXTOS } from '../textos/es.js';

const VENTANA_S = 4; // s que se comparan
const ESCALA = { mmPorS: 25, mmPorMV: 10 }; // escala común de la comparación

/**
 * Índice de inicio de la ventana que se compara: los últimos latidos del registro (lo que había en el
 * equipo al imprimir), empezando 0,4 s antes de un QRS detectado para que los dos registros queden alineados.
 */
function inicioAlineado(r) {
  const n = Math.round(VENTANA_S * r.fs);
  const antes = Math.round(0.4 * r.fs);
  const candidatos = r.detecciones.map((t) => Math.round((t - r.tInicio) * r.fs)).filter((i) => i - antes >= 0 && i - antes + n <= r.n);
  if (candidatos.length) return candidatos[candidatos.length - 1] - antes;
  return Math.max(0, r.n - n);
}

export function crearRegistros({ almacen, alVer, alMedir, alEliminar, alRenombrar }) {
  const panel = $('herr-registros');
  const lista = el('ul', { class: 'lista-registros' });
  const vacio = el('p', { class: 'vacio' }, TEXTOS.registros.vacio);
  const selA = el('select', { id: 'sel-comparar-a' });
  const selB = el('select', { id: 'sel-comparar-b' });
  const selD = el('select', { id: 'sel-comparar-derivacion' });
  for (const d of DERIVACIONES) selD.append(el('option', { value: d }, d));
  selD.value = 'I';
  const selModo = el('select', { id: 'sel-comparar-modo' }, el('option', { value: 'superpuestos' }, 'Superpuestos'), el('option', { value: 'apilados' }, 'Uno sobre otro'));
  const figura = el('div', { class: 'comparacion-figura' });
  const avisoComparar = el('p', { class: 'vacio' }, TEXTOS.registros.comparacionVacia);
  const controlesComparar = el('div', { class: 'controles-cursores' },
    el('label', { class: 'campo' }, 'Registro A', selA),
    el('label', { class: 'campo' }, 'Registro B', selB),
    el('label', { class: 'campo' }, 'Derivación', selD),
    el('label', { class: 'campo' }, 'Presentación', selModo));
  panel.append(
    el('p', { class: 'ayuda' }, 'Cada vez que pulsa «Imprimir» en el equipo se guarda aquí un registro de 20 s. Si el montaje corresponde a una condición del procedimiento, el registro recibe ese nombre; puede cambiarlo. Use «Ver» para descargarlo en PNG o PDF.'),
    vacio,
    lista,
    el('h3', { class: 'subtitulo' }, 'Comparar dos registros'),
    avisoComparar,
    controlesComparar,
    figura,
  );
  let activo = false;

  function render() {
    const registros = almacen.obtener().registros;
    vacio.hidden = registros.length > 0;
    vaciar(lista);
    for (const r of [...registros].reverse()) {
      const nombre = el('input', { type: 'text', class: 'registro-nombre', value: r.etiqueta, maxlength: 60, 'aria-label': `Nombre del registro ${r.numero}` });
      nombre.addEventListener('change', () => {
        r.etiqueta = nombre.value.trim() || `Registro ${r.numero}`;
        almacen.actualizar({ registros: [...almacen.obtener().registros] });
        alRenombrar?.(r);
      });
      lista.append(
        el('li', { class: 'registro-item' },
          el('div', { class: 'registro-datos' },
            nombre,
            el('p', {}, `N.º ${r.numero} · ${r.hora} · ${num(r.duracion, 0)} s · FC ${r.fc ? `${Math.round(r.fc)} lpm` : '—'}${r.estudiante ? ` · ${r.estudiante}` : ''}`),
            r.uniforme ? null : el('p', { class: 'marca-registro' }, 'Incluye un cambio de conexión: no corresponde a una sola condición.'),
            r.montajeResumen ? el('p', {}, r.montajeResumen) : null),
          el('div', { class: 'fila-botones' },
            el('button', { type: 'button', class: 'boton boton-sec', onclick: () => alVer(r) }, 'Ver'),
            el('button', { type: 'button', class: 'boton boton-sec', onclick: () => alMedir(r.id) }, 'Medir'),
            el('button', {
              type: 'button',
              class: 'boton boton-sec boton-peligro',
              'aria-label': `Eliminar el registro ${r.numero}`,
              onclick: () => {
                almacen.actualizar((e) => ({ ...e, registros: e.registros.filter((x) => x !== r) }));
                alEliminar?.(r);
                anunciar(TEXTOS.registros.eliminado(r.numero));
              },
            }, 'Eliminar'))),
      );
    }
    // Comparación
    const puede = registros.length >= 2;
    avisoComparar.hidden = puede;
    controlesComparar.hidden = !puede;
    figura.hidden = !puede;
    if (!puede) return;
    const previoA = selA.value;
    const previoB = selB.value;
    for (const sel of [selA, selB]) {
      vaciar(sel);
      for (const r of registros) sel.append(el('option', { value: r.id }, `${r.etiqueta} · ${r.hora}`));
    }
    selA.value = registros.some((r) => r.id === previoA) ? previoA : registros[0].id;
    selB.value = registros.some((r) => r.id === previoB) && previoB !== selA.value ? previoB : registros[registros.length - 1].id;
    comparar();
  }

  function comparar() {
    const registros = almacen.obtener().registros;
    const a = registros.find((r) => r.id === selA.value);
    const b = registros.find((r) => r.id === selB.value);
    vaciar(figura);
    if (!a || !b) return;
    const d = selD.value;
    const apilados = selModo.value === 'apilados';
    const largo = VENTANA_S * ESCALA.mmPorS;
    const ancho = 12 + largo + 2;
    const altoTira = 36;
    const alto = apilados ? 2 * altoTira : altoTira + 4;
    const svg = svgEl('svg', { viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': `Comparación de ${d}: ${a.etiqueta} y ${b.etiqueta}` });
    svg.append(cuadricula(0, 0, ancho, alto));
    const series = [
      { r: a, color: COLORES_PAPEL.trazo, nombre: 'A' },
      { r: b, color: COLORES_PAPEL.comparacion, nombre: 'B' },
    ];
    series.forEach((s, k) => {
      const base = apilados ? k * altoTira + 22 : 24;
      if (apilados || k === 0) svg.append(pulsoCalibracion(1.5, base, ESCALA.mmPorS, ESCALA.mmPorMV));
      const i0 = inicioAlineado(s.r);
      const x = s.r.derivaciones[d];
      let hay = false;
      for (let i = i0; i < Math.min(s.r.n, i0 + VENTANA_S * s.r.fs); i += 10) if (Number.isFinite(x[i])) { hay = true; break; }
      if (hay) {
        svg.append(svgEl('path', { d: trazo(x, i0, i0 + Math.round(VENTANA_S * s.r.fs), s.r.fs, { x0: 12, yBase: base, ...ESCALA, paso: 0.2 }), fill: 'none', stroke: s.color, 'stroke-width': 0.35, 'stroke-linejoin': 'round' }));
      } else {
        svg.append(texto(16, base - 1.5 + (apilados ? 0 : k * 5), `${s.nombre}: sin señal en ${d}`, { tamano: 2.8, color: s.color }));
      }
      if (apilados) svg.append(texto(1.5, k * altoTira + 4.5, `${s.nombre} · ${d}`, { tamano: 3, peso: 600, color: s.color }));
    });
    if (!apilados) svg.append(texto(1.5, 4.5, d, { tamano: 3, peso: 600, color: COLORES_PAPEL.trazo }));
    figura.append(
      svg,
      el('div', { class: 'leyenda' },
        el('span', {}, el('i', { style: `background:${COLORES_PAPEL.trazo}` }), `A: ${a.etiqueta}`),
        el('span', {}, el('i', { style: `background:${COLORES_PAPEL.comparacion}` }), `B: ${b.etiqueta}`)),
      el('p', { class: 'ayuda' }, `Escala común de ${ESCALA.mmPorS} mm/s y ${ESCALA.mmPorMV} mm/mV. Se muestran los últimos ${VENTANA_S} s de cada registro, alineados en un QRS.`),
    );
  }

  for (const s of [selA, selB, selD, selModo]) s.addEventListener('change', comparar);
  almacen.suscribir((e, a) => {
    if (activo && e.registros !== a.registros) render();
  });

  return {
    activar() {
      activo = true;
      render();
    },
    desactivar() {
      activo = false;
    },
  };
}
