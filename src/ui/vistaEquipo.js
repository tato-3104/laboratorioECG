/**
 * Electrocardiógrafo virtual: conector del cable de paciente, encendido, pantalla, indicadores de electrodos,
 * teclas y ajustes de presentación. Los filtros son fijos (config/equipo.js) y se muestran como texto.
 */
import { el, vaciar, $, num, anunciar, avisar } from './dom.js';
import { crearPantalla } from './pantallaECG.js';
import { EQUIPO, textoFiltros } from '../config/equipo.js';
import { CABLES } from '../config/electrodos.js';
import { buscarVoluntario } from '../config/voluntarios.js';
import { ENTRADAS, DERIVACIONES, DEPENDENCIAS } from '../modelo/derivaciones.js';
import { resolverEntradas } from '../conexiones/entradas.js';
import { validezDerivaciones, mensajesEquipo, listaDerivaciones } from '../conexiones/diagnostico.js';
import { conectarTroncal } from '../conexiones/montaje.js';
import { TEXTOS } from '../textos/es.js';

const TE = TEXTOS.equipo;
const etq = (e) => CABLES.etiqueta[e];
const UMBRAL_ARRASTRE = 5; // px

/**
 * Tiempo (ms) durante el que se muestra «Estabilizando línea de base…»: unas 2,5 constantes de tiempo
 * del filtro paso alto (τ = 1 / 2πf), que es lo que tarda en desaparecer el desplazamiento de los electrodos.
 */
const DURACION_TRANSITORIO_MS = Math.max(1500, (2.5 / (2 * Math.PI * EQUIPO.filtros.pasoAlto)) * 1000);

function opciones(select, valores, actual, formato = (v) => String(v)) {
  vaciar(select);
  for (const v of valores) select.append(el('option', { value: String(v), selected: String(v) === String(actual) }, formato(v)));
}

/** Electrodo que lee cada entrada de una derivación (para saber si cambió lo que registra). */
function firmaDerivacion(entradas, d) {
  return DEPENDENCIAS[d].map((e) => entradas[e].electrodo ?? '-').join(',');
}

/**
 * @param {{almacen: object, motor: object, alImprimir: () => void, alCongelar: (congelado: boolean) => void,
 *          alCalibrar: () => void, alAbrirPaciente: () => void}} op
 */
export function crearVistaEquipo({ almacen, motor, alImprimir, alCongelar, alCalibrar, alAbrirPaciente }) {
  const pantalla = crearPantalla({ lienzo: $('lienzo-ecg'), motor });
  const nodoPantalla = $('pantalla');
  const msg = $('pantalla-mensaje');
  const fcTxt = $('pantalla-fc');
  const clavija = $('btn-conector');
  const puerto = $('puerto-paciente');
  let estabilizandoHasta = 0;
  let arrancandoHasta = 0;
  let ultimoMensaje = '';

  // --- Ajustes de presentación (los filtros son fijos)
  const a0 = almacen.obtener().ajustes;
  opciones($('sel-formato'), EQUIPO.formatos.map((f) => f.id), a0.formato, (id) => EQUIPO.formatos.find((f) => f.id === id).nombre);
  opciones($('sel-derivacion'), DERIVACIONES, a0.derivacionUnica);
  opciones($('sel-velocidad'), EQUIPO.velocidades, a0.velocidad, (v) => `${num(v, v % 1 ? 1 : 0)} mm/s`);
  opciones($('sel-ganancia'), EQUIPO.ganancias, a0.ganancia, (v) => `${v} mm/mV`);
  $('filtros-fijos').textContent = `Filtros fijos: ${textoFiltros()}`;

  const cambiarAjuste = (parcial) => almacen.actualizar((e) => ({ ...e, ajustes: { ...e.ajustes, ...parcial } }));
  $('sel-formato').addEventListener('change', (e) => cambiarAjuste({ formato: e.target.value }));
  $('sel-derivacion').addEventListener('change', (e) => cambiarAjuste({ derivacionUnica: e.target.value }));
  $('sel-velocidad').addEventListener('change', (e) => cambiarAjuste({ velocidad: Number(e.target.value) }));
  $('sel-ganancia').addEventListener('change', (e) => cambiarAjuste({ ganancia: Number(e.target.value) }));

  // --- Cable de paciente: se arrastra la clavija hasta el conector (o se pulsa)
  function fijarTroncal(conectado) {
    if (almacen.obtener().montaje.cableTroncal === conectado) return;
    almacen.actualizar((e) => ({ ...e, montaje: conectarTroncal(e.montaje, conectado) }));
    anunciar(conectado ? TE.conectarTroncal : TE.desconectarTroncal);
  }
  const sobrePuerto = (x, y) => {
    const r = puerto.getBoundingClientRect();
    const m = 14;
    return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
  };
  clavija.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const inicio = { x: ev.clientX, y: ev.clientY };
    let fantasma = null;
    const mover = (e) => {
      if (!fantasma && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > UMBRAL_ARRASTRE) {
        fantasma = el('div', { class: 'fantasma fantasma-clavija', 'aria-hidden': 'true' });
        fantasma.innerHTML = clavija.querySelector('svg').outerHTML;
        document.body.append(fantasma);
        document.body.classList.add('arrastrando');
        clavija.classList.add('arrastrada');
      }
      if (fantasma) {
        e.preventDefault();
        fantasma.style.left = `${e.clientX}px`;
        fantasma.style.top = `${e.clientY}px`;
        puerto.classList.toggle('objetivo', sobrePuerto(e.clientX, e.clientY));
      }
    };
    const terminar = (e, cancelado) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('pointercancel', alCancelar);
      document.body.classList.remove('arrastrando');
      clavija.classList.remove('arrastrada');
      puerto.classList.remove('objetivo');
      if (fantasma) {
        fantasma.remove();
        if (!cancelado) fijarTroncal(sobrePuerto(e.clientX, e.clientY));
        clavija.dataset.arrastre = '1'; // el «click» que sigue al arrastre no debe alternar
      }
    };
    const alSoltar = (e) => terminar(e, false);
    const alCancelar = (e) => terminar(e, true);
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alCancelar);
  });
  clavija.addEventListener('click', () => {
    if (clavija.dataset.arrastre) {
      delete clavija.dataset.arrastre;
      return;
    }
    fijarTroncal(!almacen.obtener().montaje.cableTroncal);
  });

  // --- Encendido y teclas
  $('btn-encendido').addEventListener('click', () => {
    const e = almacen.obtener();
    const encender = !e.ajustes.encendido;
    arrancandoHasta = encender ? performance.now() + EQUIPO.arranqueS * 1000 : 0;
    almacen.actualizar({ ...e, congelado: false, ajustes: { ...e.ajustes, encendido: encender } });
  });
  $('btn-congelar').addEventListener('click', () => alCongelar(!almacen.obtener().congelado));
  $('btn-imprimir').addEventListener('click', () => alImprimir());
  $('btn-1mv').addEventListener('click', () => {
    motor.pulso1mV();
    alCalibrar?.();
  });
  $('btn-linea-base').addEventListener('click', () => {
    motor.restablecerLineaBase();
    estabilizandoHasta = 0;
    actualizarMensajes(almacen.obtener());
  });
  $('btn-paciente').addEventListener('click', () => alAbrirPaciente?.());

  // --- Indicadores, mensajes, cabecera y pie
  function actualizarIndicadores(entradas) {
    const lista = $('indicadores');
    vaciar(lista);
    for (const e of ENTRADAS) {
      const r = entradas[e];
      const clase = r.estado === 'conectada' ? '' : r.estado === 'sin-cable' ? 'mal' : 'apagado';
      const txt = r.estado === 'conectada' ? 'con señal' : r.estado === 'sin-cable' ? 'desconectado' : r.estado === 'apagado' ? 'equipo apagado' : 'sin cable de paciente';
      lista.append(el('li', { class: `indicador ${clase}`, 'aria-label': `${etq(e)}: ${txt}` }, etq(e)));
    }
  }

  function actualizarMensajes(estado) {
    const entradas = resolverEntradas(estado.montaje, { encendido: estado.ajustes.encendido });
    let lista = mensajesEquipo(entradas);
    const ahora = performance.now();
    if (estado.ajustes.encendido && ahora < arrancandoHasta) lista = [{ nivel: 'info', texto: TE.arrancando }];
    else if (ahora < estabilizandoHasta && lista.every((m) => m.nivel === 'ok')) lista.push({ nivel: 'info', texto: TE.estabilizando });
    // Solo se reescribe si cambia: la zona es «aria-live» y los lectores de pantalla la anuncian.
    const texto = lista.map((m) => `${m.nivel}:${m.texto}`).join('|');
    if (texto === ultimoMensaje) return;
    ultimoMensaje = texto;
    vaciar(msg);
    for (const m of lista) msg.append(el('span', { class: m.nivel }, m.texto));
    msg.classList.toggle('con-aviso', lista.some((m) => m.nivel === 'aviso'));
  }

  function actualizarPie(estado) {
    const a = estado.ajustes;
    const f = EQUIPO.filtros;
    const pie = $('pantalla-pie');
    vaciar(pie);
    pie.append(
      el('span', {}, `${num(a.velocidad, a.velocidad % 1 ? 1 : 0)} mm/s`),
      el('span', {}, `${a.ganancia} mm/mV`),
      el('span', {}, `${num(f.pasoAlto, 2)}–${f.pasoBajo} Hz`),
      el('span', {}, `Ranura ${f.ranura} Hz`),
      el('span', { class: 'marca-sintetica' }, TE.marcaSintetica),
    );
  }

  function resumenAccesible(estado, validez) {
    const sin = DERIVACIONES.filter((d) => !validez[d].valida);
    const fc = motor.frecuencia();
    $('resumen-pantalla').textContent = !estado.ajustes.encendido
      ? 'Equipo apagado.'
      : `Trazado ${estado.congelado ? 'congelado' : 'en curso'}. ${sin.length ? `Sin señal en ${listaDerivaciones(sin)}.` : 'Las 12 derivaciones tienen señal.'} Frecuencia cardíaca ${fc ? `${Math.round(fc)} latidos por minuto` : 'no disponible'}.`;
  }

  function render(estado, anterior) {
    const entradas = resolverEntradas(estado.montaje, { encendido: estado.ajustes.encendido });
    const validez = validezDerivaciones(entradas);
    pantalla.configurar({ ...estado.ajustes, etiqueta: etq }, validez);
    nodoPantalla.classList.toggle('apagada', !estado.ajustes.encendido);
    $('btn-encendido').setAttribute('aria-pressed', String(estado.ajustes.encendido));
    $('txt-encendido').textContent = estado.ajustes.encendido ? 'Encendido' : 'Apagado';
    const conectado = estado.montaje.cableTroncal;
    clavija.setAttribute('aria-pressed', String(conectado));
    clavija.setAttribute('aria-label', conectado ? 'Clavija del cable de paciente: conectada. Púlsela o arrástrela fuera para desconectarla.' : 'Clavija del cable de paciente: desconectada. Arrástrela al conector PACIENTE o púlsela para conectarla.');
    $('conexion-paciente').classList.toggle('conectada', conectado);
    $('txt-conector').textContent = conectado ? TE.conectarTroncal : TE.desconectarTroncal;
    const cong = $('btn-congelar');
    cong.setAttribute('aria-pressed', String(estado.congelado));
    cong.textContent = estado.congelado ? 'Reanudar' : 'Congelar';
    for (const id of ['btn-congelar', 'btn-imprimir', 'btn-1mv', 'btn-linea-base']) $(id).disabled = !estado.ajustes.encendido;
    $('btn-1mv').disabled ||= estado.congelado;
    $('btn-linea-base').disabled ||= estado.congelado;
    const v = buscarVoluntario(estado.paciente.voluntario);
    $('pantalla-paciente').textContent = `SUJETO · ${v.sexo.toUpperCase()} · ${v.edad} AÑOS`;
    $('ajuste-derivacion').hidden = estado.ajustes.formato !== 'una';
    $('sel-formato').value = estado.ajustes.formato;
    $('sel-derivacion').value = estado.ajustes.derivacionUnica;
    $('sel-velocidad').value = String(estado.ajustes.velocidad);
    $('sel-ganancia').value = String(estado.ajustes.ganancia);
    // Transitorio de línea de base cuando cambia lo que registra alguna derivación (al conectar, al encender
    // o al cambiar un cable de electrodo): los electrodos tienen potenciales de media celda distintos.
    if (anterior) {
      const entradasAntes = resolverEntradas(anterior.montaje, { encendido: anterior.ajustes.encendido });
      const antes = validezDerivaciones(entradasAntes);
      const cambio = DERIVACIONES.some(
        (d) => validez[d].valida && (!antes[d].valida || firmaDerivacion(entradas, d) !== firmaDerivacion(entradasAntes, d)),
      );
      if (cambio) estabilizandoHasta = performance.now() + DURACION_TRANSITORIO_MS;
    }
    $('pantalla-estado').textContent = !estado.ajustes.encendido
      ? TE.apagado
      : performance.now() < arrancandoHasta
        ? TE.iniciando
        : estado.congelado
          ? TE.congelado
          : TE.monitor;
    actualizarIndicadores(entradas);
    actualizarMensajes(estado);
    actualizarPie(estado);
    resumenAccesible(estado, validez);
  }

  almacen.suscribir((e, a) => {
    if (e.ajustes !== a.ajustes || e.montaje !== a.montaje || e.congelado !== a.congelado || e.paciente !== a.paciente) render(e, a);
  });
  render(almacen.obtener(), null);

  // --- Refresco periódico (lo llama el bucle principal)
  let ultimoTexto = 0;
  let ultimoLatido = 0;
  function cuadro(ahora) {
    pantalla.dibujar();
    if (ahora - ultimoTexto > 500) {
      ultimoTexto = ahora;
      const e = almacen.obtener();
      const fc = e.ajustes.encendido ? motor.frecuencia() : null;
      fcTxt.textContent = fc ? `${Math.round(fc)} lpm` : TE.sinFC;
      $('pantalla-hora').textContent = new Date().toLocaleTimeString('es-CO', { hour12: false });
      if ((estabilizandoHasta && ahora > estabilizandoHasta) || (arrancandoHasta && ahora > arrancandoHasta)) {
        if (ahora > estabilizandoHasta) estabilizandoHasta = 0;
        if (ahora > arrancandoHasta) {
          arrancandoHasta = 0;
          if (e.ajustes.encendido) $('pantalla-estado').textContent = e.congelado ? TE.congelado : TE.monitor;
        }
        actualizarMensajes(e);
      }
      resumenAccesible(e, validezDerivaciones(resolverEntradas(e.montaje, { encendido: e.ajustes.encendido })));
    }
    // Latido visual del corazón de la cabecera
    const det = motor.detector.detecciones;
    const ult = det[det.length - 1];
    if (ult && ult !== ultimoLatido && !almacen.obtener().congelado) {
      ultimoLatido = ult;
      const icono = fcTxt.parentElement;
      icono.classList.add('latido');
      setTimeout(() => icono.classList.remove('latido'), 140);
    }
  }

  return {
    cuadro,
    pantalla,
    avisar,
    /** ¿El equipo terminó de iniciar? (mientras inicia no imprime) */
    listo: () => performance.now() >= arrancandoHasta,
  };
}
