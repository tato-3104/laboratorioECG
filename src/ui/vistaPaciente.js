/**
 * Vista del paciente: cuerpo y tórax interactivos, bandeja de electrodos y cables.
 *
 * Interacciones (todas modifican el montaje del estado central):
 *  - Arrastrar una pieza de la bandeja al cuerpo → coloca un electrodo.
 *  - Arrastrar un terminal de cable a un electrodo → lo engancha. Si se suelta donde no hay electrodo, no pasa
 *    nada: primero hay que colocar el electrodo (como en el laboratorio presencial).
 *  - Botón «×» de un terminal enganchado → lo desengancha.
 *  - Arrastrar un electrodo colocado → lo mueve; soltarlo fuera del cuerpo → lo retira.
 *  - Teclado / toque: elegir una pieza (Intro o toque), ubicar con flechas o tocando el cuerpo, Intro para soltar.
 */
import { el, svgEl, vaciar, $, puntoSVG, anunciar } from './dom.js';
import { dibujarCuerpo, dibujarTorax } from './dibujoAnatomico.js';
import { VISTA_CUERPO, VISTA_TORAX } from '../config/anatomia.js';
import { CABLES } from '../config/electrodos.js';
import { ENTRADAS } from '../modelo/derivaciones.js';
import { sitioDesdeVista, describirSitio, posicionEnCuerpo, posicionEnVistaTorax, validarSitioParaTipo, sitioPinzaHabitual, toraxAVistaTorax } from '../conexiones/sitios.js';
import { colocarElectrodo, moverElectrodo, retirarElectrodo, conectarCable, desconectarCable, disponibles, entradasDeElectrodo } from '../conexiones/montaje.js';
import { TEXTOS } from '../textos/es.js';

const T = TEXTOS.paciente;
const UMBRAL_ARRASTRE = 5; // px antes de considerar que empezó un arrastre

export function crearVistaPaciente({ almacen, torax }) {
  const contenedor = $('contenedor-vista');
  const estadoTxt = $('estado-paciente');
  const listaCables = $('lista-cables');
  let svg = null;
  let claveDibujo = '';
  let seleccion = null; // { tipo: 'nuevo'|'electrodo'|'terminal', ... }
  let cursor = null; // posición del cursor de teclado en la vista actual {u, v}
  let arrastre = null;

  const etq = (entrada) => CABLES.etiqueta[entrada];
  const colorDe = (entrada) => CABLES.color[entrada];
  const vista = () => almacen.obtener().vista;

  function mensaje(texto, tipo = '') {
    estadoTxt.textContent = texto;
    estadoTxt.className = `estado-paciente ${tipo}`;
    anunciar(texto);
  }

  function actualizarMontaje(fn) {
    almacen.actualizar((e) => {
      const r = fn(e.montaje);
      if (!r) return e;
      if (r.error) {
        mensaje(r.error, 'error');
        return e;
      }
      const montaje = r.montaje ?? r;
      return montaje === e.montaje ? e : { ...e, montaje };
    });
  }

  // ---------------------------------------------------------------- dibujo
  function posicion(sitio, v = vista()) {
    return v === 'torax' ? posicionEnVistaTorax(sitio) : posicionEnCuerpo(sitio);
  }
  const horquilla = () => (vista() === 'torax' ? VISTA_TORAX.horquilla : VISTA_CUERPO.horquilla);

  function render(estado) {
    const clave = `${estado.vista}|${estado.referencias}|${estado.corazon}`;
    if (clave !== claveDibujo || !svg) {
      claveDibujo = clave;
      svg = estado.vista === 'torax' ? dibujarTorax(torax, estado) : dibujarCuerpo(estado);
      svg.addEventListener('pointerdown', alPresionarSVG);
      svg.addEventListener('keydown', alTeclaSVG);
      vaciar(contenedor).append(svg);
      if (seleccion) cursor = cursorInicial(seleccion);
    }
    dibujarDinamico(estado);
    actualizarBandeja(estado);
    actualizarCables(estado);
    for (const b of document.querySelectorAll('[data-vista]')) {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.vista === estado.vista));
    }
    $('chk-referencias').checked = estado.referencias;
    $('leyenda-torax').hidden = !(estado.vista === 'torax' && estado.referencias);
    $('chk-corazon').checked = estado.corazon;
  }

  function dibujarDinamico(estado) {
    const m = estado.montaje;
    const capaCables = svg.querySelector('.capa-cables');
    const capaElectrodos = svg.querySelector('.capa-electrodos');
    const capaAyudas = svg.querySelector('.capa-ayudas');
    vaciar(capaCables);
    vaciar(capaElectrodos);
    vaciar(capaAyudas);
    const enTorax = estado.vista === 'torax';
    const Y = horquilla();
    const grosor = enTorax ? 2.6 : 1.9;

    // Cables (de la horquilla a cada electrodo visible)
    for (const entrada of ENTRADAS) {
      const id = m.cables[entrada];
      const e = id ? m.electrodos[id] : null;
      if (!e) continue;
      const p = posicion(e.sitio);
      if (!p) continue;
      const d = trazoCable(p, Y, enTorax, e.tipo === 'pinza');
      capaCables.append(
        svgEl('path', { d, class: 'cable-contorno', 'stroke-width': grosor + 1.6 }),
        svgEl('path', { d, class: 'cable', stroke: colorDe(entrada), 'stroke-width': grosor }),
      );
    }
    // Cable troncal hacia el equipo (atenuado si no está conectado al equipo) y horquilla de los cables.
    const dTroncal = enTorax
      ? `M${Y[0]} ${Y[1]} C${Y[0] + 10} ${Y[1] + 18} ${Y[0] + 20} ${Y[1] + 34} 640 ${Y[1] + 52}`
      : `M${Y[0]} ${Y[1]} C${Y[0] + 14} ${Y[1] - 10} 306 246 320 242`;
    capaCables.append(
      svgEl('path', { d: dTroncal, class: 'troncal', 'stroke-width': enTorax ? 7 : 5, opacity: m.cableTroncal ? 1 : 0.35 }),
      svgEl('rect', { x: Y[0] - 12, y: Y[1] - 12, width: 24, height: 24, rx: 6, class: 'horquilla' }),
    );

    // Electrodos
    const etiquetas = [];
    const ordenados = Object.values(m.electrodos).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'pinza' ? -1 : 1));
    for (const e of ordenados) {
      const p = posicion(e.sitio);
      if (!p) continue;
      const entradas = entradasDeElectrodo(m, e.id);
      const desc = describirSitio(e.sitio, torax);
      const g = svgEl('g', {
        class: `electrodo${seleccion?.tipo === 'electrodo' && seleccion.id === e.id ? ' seleccionado' : ''}`,
        transform: `translate(${p.u.toFixed(1)} ${p.v.toFixed(1)})`,
        tabindex: '0',
        role: 'button',
        'data-id': e.id,
        'aria-label': `${e.tipo === 'pinza' ? 'Pinza' : 'Electrodo adhesivo'} en ${desc}. ${entradas.length ? `Cable ${entradas.map(etq).join(' y ')}.` : 'Sin cable.'} Intro para moverlo.`,
      });
      if (e.tipo === 'pinza') {
        g.append(
          svgEl('rect', { x: -15, y: -9.5, width: 30, height: 19, rx: 6, class: 'electrodo-foco' }),
          svgEl('rect', { x: -12, y: -6.5, width: 24, height: 13, rx: 4, class: 'electrodo-pinza' }),
        );
        entradas.forEach((ent, k) => {
          g.append(svgEl('circle', { cx: 12 + k * 7, cy: 0, r: 4.6, fill: colorDe(ent), stroke: 'var(--contorno-cable)', 'stroke-width': 1.2 }));
        });
      } else {
        const r = enTorax ? 11 : 6;
        g.append(
          svgEl('circle', { r: r + 4, class: 'electrodo-foco' }),
          svgEl('circle', { r, class: 'electrodo-adhesivo' }),
        );
        if (entradas.length) {
          entradas.forEach((ent, k) => {
            g.append(svgEl('circle', { cx: k * (enTorax ? 6 : 3), r: enTorax ? 4.6 : 2.6, fill: colorDe(ent), stroke: 'var(--contorno-cable)', 'stroke-width': 0.8 }));
          });
        } else {
          g.append(svgEl('circle', { r: enTorax ? 4.6 : 2.6, class: 'electrodo-broche-vacio' }));
        }
      }
      g.addEventListener('pointerdown', (ev) => iniciarPresion(ev, { tipo: 'electrodo', id: e.id }));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          seleccionar({ tipo: 'electrodo', id: e.id });
        }
      });
      capaElectrodos.append(g);
      if (entradas.length && (enTorax || e.tipo === 'pinza')) etiquetas.push({ p, texto: entradas.map(etq).join('·'), pinza: e.tipo === 'pinza' });
    }
    colocarEtiquetas(capaAyudas, etiquetas, enTorax);
    dibujarCursor();
  }

  function trazoCable(p, Y, enTorax, esPinza) {
    const f = (v) => v.toFixed(1);
    if (enTorax) return `M${f(p.u)} ${f(p.v)} C${f(p.u)} ${f(p.v + 110)} ${f(Y[0] - 90)} ${f(Y[1])} ${Y[0]} ${Y[1]}`;
    const debajo = p.v > Y[1];
    const c1 = debajo ? [p.u + 12, p.v - 70] : [p.u + (esPinza ? 26 : 0), p.v + (esPinza ? 66 : 60)];
    const c2 = [Y[0] - 46, Y[1] + (debajo ? 30 : 34)];
    return `M${f(p.u)} ${f(p.v)} C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${Y[0]} ${Y[1]}`;
  }

  function colocarEtiquetas(capa, etiquetas, enTorax) {
    const ocupados = [];
    const ancho = (t) => 10 + t.length * (enTorax ? 8.8 : 6.4);
    const alto = enTorax ? 21 : 16;
    for (const et of etiquetas) {
      const w = ancho(et.texto);
      const centro = enTorax ? VISTA_TORAX.origen[0] : 150;
      const candidatos = enTorax
        ? [[et.p.u + 6, et.p.v - 34], [et.p.u + 6, et.p.v + 16], [et.p.u - w - 6, et.p.v - 34], [et.p.u - w - 6, et.p.v + 16]]
        : [[et.p.u < centro ? et.p.u - w - 16 : et.p.u + 20, et.p.v - alto / 2], [et.p.u - w / 2, et.p.v + 12]];
      if (enTorax && et.p.u < centro) candidatos.unshift([et.p.u - w - 6, et.p.v - 34]);
      let elegido = candidatos[0];
      for (const c of candidatos) {
        const choca = ocupados.some((o) => c[0] < o[0] + o[2] && c[0] + w > o[0] && c[1] < o[1] + o[3] && c[1] + alto > o[1]);
        if (!choca) {
          elegido = c;
          break;
        }
      }
      ocupados.push([elegido[0], elegido[1], w, alto]);
      capa.append(
        svgEl('g', { class: 'etiqueta-cable', transform: `translate(${elegido[0].toFixed(1)} ${elegido[1].toFixed(1)})` },
          svgEl('rect', { width: w, height: alto, rx: 4 }),
          svgEl('text', { x: 5, y: alto - 5.5, 'font-size': enTorax ? 14.5 : 10.5 }, et.texto)),
      );
    }
  }

  function actualizarBandeja(estado) {
    const d = disponibles(estado.montaje);
    $('cuenta-pinza').textContent = d.pinza;
    $('cuenta-adhesivo').textContent = d.adhesivo;
    $('bandeja-pinza').disabled = d.pinza <= 0;
    $('bandeja-adhesivo').disabled = d.adhesivo <= 0;
    $('bandeja-pinza').setAttribute('aria-label', `Pinzas en la bandeja: ${d.pinza}. Arrastre o pulse Intro para colocar una.`);
    $('bandeja-adhesivo').setAttribute('aria-label', `Electrodos adhesivos en la bandeja: ${d.adhesivo}. Arrastre o pulse Intro para colocar uno.`);
  }

  function actualizarCables(estado) {
    const m = estado.montaje;
    vaciar(listaCables);
    for (const entrada of ENTRADAS) {
      const id = m.cables[entrada];
      const e = id ? m.electrodos[id] : null;
      const destino = e ? describirSitio(e.sitio, torax).replace('tórax: ', '') : T.destinoSuelto;
      const boton = el(
        'button',
        {
          type: 'button',
          class: `terminal${e ? '' : ' suelto'}${seleccion?.tipo === 'terminal' && seleccion.entrada === entrada ? ' seleccionado' : ''}`,
          'data-entrada': entrada,
          title: e ? `${etq(entrada)}: ${destino}` : `${etq(entrada)}: sin enganchar`,
          'aria-label': `Cable ${etq(entrada)}, color ${CABLES.nombreColor[entrada]}: ${e ? `enganchado en ${destino}` : 'sin enganchar'}. Arrastre o pulse Intro para engancharlo.`,
        },
        el('span', { class: 'terminal-color', style: `background:${colorDe(entrada)}` }),
        el('span', { class: 'terminal-texto' }, el('span', { class: 'terminal-nombre' }, etq(entrada)), el('span', { class: 'terminal-destino' }, destino)),
      );
      const soltarCable = e
        ? el('button', {
            type: 'button',
            class: 'terminal-soltar',
            'data-soltar': entrada,
            'aria-label': `Desenganchar el cable ${etq(entrada)}`,
            title: `Desenganchar ${etq(entrada)}`,
            onclick: () => {
              actualizarMontaje((mm) => desconectarCable(mm, entrada));
              mensaje(T.desconectado(etq(entrada)));
              listaCables.querySelector(`[data-entrada="${entrada}"]`)?.focus();
            },
          }, '×')
        : null;
      boton.addEventListener('pointerdown', (ev) => iniciarPresion(ev, { tipo: 'terminal', entrada }));
      boton.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          seleccionar({ tipo: 'terminal', entrada });
        } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && e) {
          ev.preventDefault();
          actualizarMontaje((mm) => desconectarCable(mm, entrada));
          mensaje(T.desconectado(etq(entrada)));
        }
      });
      listaCables.append(el('li', { class: 'cable-item' }, boton, soltarCable));
    }
  }

  // ---------------------------------------------------------------- selección y teclado
  function cursorInicial(sel) {
    const m = almacen.obtener().montaje;
    if (sel.tipo === 'electrodo') {
      const e = m.electrodos[sel.id];
      const p = e && posicion(e.sitio);
      if (p) return { ...p };
    }
    if (sel.tipo === 'terminal') {
      const libre = Object.values(m.electrodos).find((e) => !entradasDeElectrodo(m, e.id).length && posicion(e.sitio));
      if (libre) return { ...posicion(libre.sitio) };
      const zona = { RA: 'brazo_der', LA: 'brazo_izq', LL: 'pierna_izq', RL: 'pierna_der' }[sel.entrada];
      if (zona && vista() === 'cuerpo') return posicionEnCuerpo(sitioPinzaHabitual(zona));
    }
    if (sel.tipo === 'nuevo' && sel.tipoElectrodo === 'pinza' && vista() === 'cuerpo') return posicionEnCuerpo(sitioPinzaHabitual('brazo_der'));
    return vista() === 'torax' ? toraxAVistaTorax(0, 0) : posicionEnCuerpo({ zona: 'torso', x: 0, y: 0 });
  }

  function seleccionar(sel) {
    if (sel.tipo === 'electrodo' && !almacen.obtener().montaje.electrodos[sel.id]) return;
    seleccion = sel;
    cursor = cursorInicial(sel);
    const txt =
      sel.tipo === 'terminal' ? T.tecladoCable(etq(sel.entrada)) : sel.tipo === 'electrodo' ? T.tecladoMover : T.tecladoElectrodo;
    mensaje(txt);
    render(almacen.obtener());
    svg.focus({ preventScroll: true });
  }

  function cancelarSeleccion() {
    seleccion = null;
    cursor = null;
    render(almacen.obtener());
  }

  function dibujarCursor() {
    if (!svg || !seleccion || !cursor) return;
    const capa = svg.querySelector('.capa-ayudas');
    const r = vista() === 'torax' ? 16 : 9;
    capa.append(
      svgEl('circle', { cx: cursor.u, cy: cursor.v, r, class: 'cursor-teclado' }),
      svgEl('path', { d: `M${cursor.u - r - 6} ${cursor.v} H${cursor.u - r + 3} M${cursor.u + r - 3} ${cursor.v} H${cursor.u + r + 6} M${cursor.u} ${cursor.v - r - 6} V${cursor.v - r + 3} M${cursor.u} ${cursor.v + r - 3} V${cursor.v + r + 6}`, class: 'cursor-teclado' }),
    );
  }

  let temporizadorDescripcion = null;
  function describirCursor() {
    clearTimeout(temporizadorDescripcion);
    temporizadorDescripcion = setTimeout(() => {
      const r = sitioDesdeVista(vista(), cursor.u, cursor.v, torax);
      const cerca = electrodoCercano(cursor);
      let txt = r.sitio ? describirSitio(r.sitio, torax) : 'fuera de la zona válida';
      if (cerca) txt += '; sobre un electrodo colocado';
      anunciar(txt);
    }, 250);
  }

  function alTeclaSVG(ev) {
    if (!seleccion) return;
    const paso = (vista() === 'torax' ? 7 : 2.5) * (ev.shiftKey ? 4 : 1);
    const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[ev.key];
    if (mov) {
      ev.preventDefault();
      cursor = { u: cursor.u + mov[0], v: cursor.v + mov[1] };
      render(almacen.obtener());
      describirCursor();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      soltarEn(seleccion, cursor);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelarSeleccion();
      mensaje(T.inicial);
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && seleccion.tipo === 'electrodo') {
      ev.preventDefault();
      const id = seleccion.id;
      seleccion = null;
      actualizarMontaje((m) => retirarElectrodo(m, id));
      mensaje(T.retirado);
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && seleccion.tipo === 'terminal') {
      ev.preventDefault();
      const entrada = seleccion.entrada;
      seleccion = null;
      actualizarMontaje((m) => desconectarCable(m, entrada));
      mensaje(T.desconectado(etq(entrada)));
    }
  }

  // ---------------------------------------------------------------- soltar (común a ratón, toque y teclado)
  function electrodoCercano(p) {
    const m = almacen.obtener().montaje;
    const radio = vista() === 'torax' ? 22 : 12;
    let mejor = null;
    for (const e of Object.values(m.electrodos)) {
      const q = posicion(e.sitio);
      if (!q) continue;
      const d = Math.hypot(q.u - p.u, q.v - p.v);
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { e, d };
    }
    return mejor?.e ?? null;
  }

  /**
   * @param {object} carga  qué se suelta
   * @param {{u:number, v:number}|null} p  punto en la vista (null = fuera del dibujo)
   */
  function soltarEn(carga, p) {
    const vistaActual = vista();
    if (carga.tipo === 'terminal') {
      const cable = etq(carga.entrada);
      const cerca = p && electrodoCercano(p);
      if (cerca) {
        actualizarMontaje((m) => conectarCable(m, carga.entrada, cerca.id));
        mensaje(T.conectado(cable, describirSitio(cerca.sitio, torax).replace('tórax: ', '')), 'ok');
      } else {
        // Sin electrodo debajo: el terminal no se engancha a la piel (hay que colocar antes el electrodo).
        mensaje(T.sinElectrodo, 'error');
        if (!p) {
          seleccion = null;
          cursor = null;
          render(almacen.obtener());
        }
        return;
      }
    } else if (carga.tipo === 'nuevo') {
      if (!p) return;
      const r = sitioDesdeVista(vistaActual, p.u, p.v, torax);
      if (r.error) return mensaje(r.error, 'error');
      const val = validarSitioParaTipo(carga.tipoElectrodo, r.sitio);
      if (!val.ok) return mensaje(val.motivo, 'error');
      let id = null;
      actualizarMontaje((m) => {
        const rc = colocarElectrodo(m, carga.tipoElectrodo, r.sitio);
        if (!rc.error) id = rc.id;
        return rc;
      });
      if (id) {
        const e = almacen.obtener().montaje.electrodos[id];
        mensaje(T.colocado(carga.tipoElectrodo, describirSitio(e.sitio, torax).replace('tórax: ', '')), 'ok');
      }
    } else if (carga.tipo === 'electrodo') {
      if (!p) {
        actualizarMontaje((m) => retirarElectrodo(m, carga.id));
        mensaje(T.retirado);
      } else {
        const r = sitioDesdeVista(vistaActual, p.u, p.v, torax);
        if (r.error) return mensaje(r.error, 'error');
        let ok = false;
        actualizarMontaje((m) => {
          const rm = moverElectrodo(m, carga.id, r.sitio);
          ok = !rm.error;
          return rm;
        });
        if (ok) mensaje(T.movido(describirSitio(almacen.obtener().montaje.electrodos[carga.id].sitio, torax).replace('tórax: ', '')), 'ok');
      }
    }
    seleccion = null;
    cursor = null;
    render(almacen.obtener());
  }

  // ---------------------------------------------------------------- arrastre con puntero
  function iniciarPresion(ev, carga) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.stopPropagation();
    const inicio = { x: ev.clientX, y: ev.clientY };
    let activo = false;
    let fantasma = null;
    const mover = (e) => {
      if (!activo && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > UMBRAL_ARRASTRE) {
        activo = true;
        fantasma = crearFantasma(carga);
        document.body.append(fantasma);
        document.body.classList.add('arrastrando');
      }
      if (activo) {
        e.preventDefault();
        fantasma.style.left = `${e.clientX}px`;
        fantasma.style.top = `${e.clientY}px`;
        marcarObjetivo(carga, e.clientX, e.clientY);
      }
    };
    const soltar = (e) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      document.body.classList.remove('arrastrando');
      fantasma?.remove();
      if (activo) {
        const p = puntoEnVista(e.clientX, e.clientY);
        soltarEn(carga, p);
      } else {
        // toque o clic sin arrastre: modo de colocación (luego se toca el sitio o se usan las flechas)
        if (carga.tipo === 'nuevo' && disponibles(almacen.obtener().montaje)[carga.tipoElectrodo] <= 0) return;
        seleccionar(carga);
      }
    };
    const cancelar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      document.body.classList.remove('arrastrando');
      fantasma?.remove();
      render(almacen.obtener());
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
  }

  /** Clic o toque directo sobre el dibujo mientras hay una pieza elegida: la suelta allí. */
  function alPresionarSVG(ev) {
    if (!seleccion) return;
    const p = puntoSVG(svg, ev.clientX, ev.clientY);
    if (!p) return;
    ev.preventDefault();
    soltarEn(seleccion, p);
  }

  function puntoEnVista(x, y) {
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    return puntoSVG(svg, x, y);
  }

  function marcarObjetivo(carga, x, y) {
    const capa = svg.querySelector('.capa-ayudas');
    capa.querySelectorAll('.objetivo-arrastre').forEach((n) => n.remove());
    const p = puntoEnVista(x, y);
    if (!p) return;
    const enTorax = vista() === 'torax';
    if (carga.tipo === 'terminal') {
      const cerca = electrodoCercano(p);
      if (cerca) {
        const q = posicion(cerca.sitio);
        capa.append(svgEl('circle', { cx: q.u, cy: q.v, r: enTorax ? 18 : 11, class: 'objetivo-arrastre' }));
      } else {
        // Sin electrodo debajo, el terminal no se puede enganchar.
        capa.append(svgEl('circle', { cx: p.u, cy: p.v, r: enTorax ? 14 : 8, class: 'objetivo-arrastre invalido' }));
      }
      return;
    }
    const r = sitioDesdeVista(vista(), p.u, p.v, torax);
    let valido = !r.error;
    if (valido && carga.tipo === 'nuevo') valido = validarSitioParaTipo(carga.tipoElectrodo, r.sitio).ok;
    capa.append(svgEl('circle', { cx: p.u, cy: p.v, r: enTorax ? 14 : 8, class: `objetivo-arrastre${valido ? '' : ' invalido'}` }));
  }

  function crearFantasma(carga) {
    const caja = el('div', { class: 'fantasma', 'aria-hidden': 'true' });
    let dibujo;
    if (carga.tipo === 'terminal') {
      dibujo = svgEl('svg', { width: 54, height: 30, viewBox: '0 0 54 30' },
        svgEl('circle', { cx: 12, cy: 15, r: 10, fill: colorDe(carga.entrada), stroke: '#2b3134', 'stroke-width': 2 }),
        svgEl('rect', { x: 24, y: 6, width: 28, height: 18, rx: 4, fill: '#ffffff', stroke: '#7f8b86' }),
        svgEl('text', { x: 38, y: 19.5, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, 'font-family': 'IBM Plex Mono, monospace', fill: '#1a2220' }, etq(carga.entrada)));
    } else {
      const tipo = carga.tipo === 'nuevo' ? carga.tipoElectrodo : almacen.obtener().montaje.electrodos[carga.id]?.tipo;
      dibujo = tipo === 'pinza'
        ? svgEl('svg', { width: 40, height: 24, viewBox: '0 0 40 24' }, svgEl('rect', { x: 4, y: 5, width: 32, height: 14, rx: 5, fill: '#4a5458' }))
        : svgEl('svg', { width: 28, height: 28, viewBox: '0 0 28 28' }, svgEl('circle', { cx: 14, cy: 14, r: 11, fill: '#ffffff', stroke: '#7f8b86', 'stroke-width': 1.5 }), svgEl('circle', { cx: 14, cy: 14, r: 4, fill: '#c3cac6' }));
    }
    caja.append(dibujo);
    return caja;
  }

  // ---------------------------------------------------------------- controles fijos
  for (const b of document.querySelectorAll('button[data-vista]')) {
    b.addEventListener('click', () => almacen.actualizar({ vista: b.dataset.vista }));
  }
  $('chk-referencias').addEventListener('change', (e) => almacen.actualizar({ referencias: e.target.checked }));
  $('chk-corazon').addEventListener('change', (e) => almacen.actualizar({ corazon: e.target.checked }));
  for (const tipo of ['pinza', 'adhesivo']) {
    const b = $(`bandeja-${tipo}`);
    b.addEventListener('pointerdown', (ev) => {
      if (b.disabled) return;
      iniciarPresion(ev, { tipo: 'nuevo', tipoElectrodo: tipo });
    });
    b.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && !b.disabled) {
        ev.preventDefault();
        seleccionar({ tipo: 'nuevo', tipoElectrodo: tipo });
      }
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && seleccion && !svg?.contains(document.activeElement)) {
      cancelarSeleccion();
      mensaje(T.inicial);
    }
  });

  almacen.suscribir((e, a) => {
    if (e.montaje !== a.montaje || e.vista !== a.vista || e.referencias !== a.referencias || e.corazon !== a.corazon) {
      render(e);
    }
  });
  render(almacen.obtener());

  return { mensaje, render: () => render(almacen.obtener()) };
}
