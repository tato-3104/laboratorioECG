/**
 * Panel «Procedimiento»: los pasos de la práctica con su avance, el botón «Revisar montaje» y
 * «Retirar todos los electrodos».
 *
 * El avance (qué pasos están cumplidos) lo calcula main.js con src/procedimiento/pasos.js y lo guarda en el
 * estado; este panel solo lo muestra. «Revisar montaje» da un resultado fijo (una «foto» del montaje en ese
 * momento): si después se cambia algo, el panel avisa que la revisión quedó desactualizada.
 */
import { el, vaciar, $, anunciar } from './dom.js';
import { PARTES, pasoActual } from '../procedimiento/pasos.js';
import { diagnosticarMontaje } from '../conexiones/diagnostico.js';
import { montajeVacio } from '../conexiones/montaje.js';
import { TEXTOS } from '../textos/es.js';

const TP = TEXTOS.procedimiento;

/**
 * @param {{almacen: object, torax: object, pasos: object[], vistaPaciente: {mensaje: Function},
 *          revision: {habilitada: boolean, detalles: boolean}}} op
 */
export function crearPanelProcedimiento({ almacen, torax, pasos, vistaPaciente, revision }) {
  const lista = $('lista-procedimiento');
  const boton = $('btn-revisar');
  const resultado = $('resultado-revision');
  const anuncio = $('anuncio-procedimiento');
  const abiertos = new Set(); // pasos cuya ayuda abrió el estudiante
  let revisado = null; // { montaje, diagnostico, detalles }

  $('progreso').setAttribute('aria-valuemax', String(pasos.length));
  if (!revision.habilitada) boton.hidden = true;

  // ------------------------------------------------------------------ revisar montaje
  function mostrarRevision() {
    vaciar(resultado);
    if (!revisado) {
      resultado.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
      return;
    }
    const e = almacen.obtener();
    const { diagnostico } = revisado;
    const desactualizada = e.montaje !== revisado.montaje;
    resultado.hidden = false;
    resultado.classList.toggle('desactualizada', desactualizada);
    boton.setAttribute('aria-expanded', 'true');
    if (diagnostico.correcto) {
      resultado.append(el('p', { class: 'conclusion ok' }, TP.revisionCorrecta));
    } else {
      resultado.append(el('p', { class: 'conclusion mal' }, TP.revisionConProblemas(diagnostico.errores.length)));
      if (revision.detalles) {
        if (revisado.detalles) {
          resultado.append(el('ul', {}, diagnostico.errores.map((x) => el('li', {}, x.texto))));
        } else {
          resultado.append(
            el('button', {
              type: 'button',
              class: 'boton boton-sec boton-pequeno',
              id: 'btn-detalles-revision',
              onclick: () => {
                revisado.detalles = true;
                mostrarRevision();
                resultado.querySelector('ul')?.setAttribute('tabindex', '-1');
                resultado.querySelector('ul')?.focus();
              },
            }, 'Mostrar cuáles'),
            el('p', { class: 'ayuda' }, 'Antes de verlos, intente encontrarlos usted mismo en el paciente y en el trazado.'),
          );
        }
      }
    }
    if (!e.ajustes.encendido) resultado.append(el('p', { class: 'ayuda' }, TP.equipoApagado));
    if (desactualizada) resultado.append(el('p', { class: 'ayuda nota-desactualizada' }, TP.revisionDesactualizada));
  }

  boton.addEventListener('click', () => {
    const e = almacen.obtener();
    const diagnostico = diagnosticarMontaje(e.montaje, torax);
    revisado = { montaje: e.montaje, diagnostico, detalles: false };
    if (diagnostico.correcto && !e.procedimiento.eventos.revisionCorrecta) {
      almacen.actualizar((s) => ({ ...s, procedimiento: { ...s.procedimiento, eventos: { ...s.procedimiento.eventos, revisionCorrecta: true } } }));
    }
    mostrarRevision();
    anunciar(diagnostico.correcto ? TP.revisionCorrecta : TP.revisionConProblemas(diagnostico.errores.length));
  });

  $('btn-retirar-todo').addEventListener('click', () => {
    const e = almacen.obtener();
    if (!Object.keys(e.montaje.electrodos).length) {
      vistaPaciente.mensaje(TP.todoRetirado);
      return;
    }
    almacen.actualizar({ ...e, montaje: { ...montajeVacio(), cableTroncal: e.montaje.cableTroncal, contador: e.montaje.contador } });
    vistaPaciente.mensaje(TP.todoRetirado);
  });

  // ------------------------------------------------------------------ lista de pasos
  function render() {
    const e = almacen.obtener();
    const hechos = e.procedimiento.hechos;
    const actual = pasoActual(pasos, hechos);
    vaciar(lista);
    let parte = null;
    let sublista = null;
    pasos.forEach((p, i) => {
      if (p.parte !== parte) {
        parte = p.parte;
        const info = PARTES.find((x) => x.id === parte);
        const hechosParte = pasos.filter((x) => x.parte === parte && hechos.includes(x.id)).length;
        const totalParte = pasos.filter((x) => x.parte === parte).length;
        sublista = el('ol', { class: 'pasos-parte', start: String(i + 1) });
        lista.append(
          el('li', { class: 'parte' },
            el('h3', { class: 'parte-titulo' },
              el('span', {}, `${info.id}. ${info.titulo}`),
              el('span', { class: 'parte-cuenta' }, `${hechosParte}/${totalParte}`)),
            sublista),
        );
      }
      const hecho = hechos.includes(p.id);
      const esActual = actual?.id === p.id;
      const abierto = esActual || abiertos.has(p.id);
      const idAyuda = `ayuda-paso-${p.id}`;
      const encabezado = el('button', {
        type: 'button',
        class: 'paso-encabezado',
        'aria-expanded': String(abierto),
        'aria-controls': idAyuda,
        onclick: () => {
          if (abiertos.has(p.id)) abiertos.delete(p.id);
          else abiertos.add(p.id);
          render();
          lista.querySelector(`[data-paso="${p.id}"] .paso-encabezado`)?.focus();
        },
      },
      el('span', { class: 'paso-marca', 'aria-hidden': 'true' }, hecho ? '✓' : String(i + 1)),
      el('span', { class: 'paso-titulo' }, p.titulo),
      el('span', { class: 'solo-lector' }, hecho ? ' (completado)' : esActual ? ' (paso actual)' : ''));
      sublista.append(
        el('li', { class: `paso${hecho ? ' hecho' : ''}${esActual ? ' actual' : ''}`, 'data-paso': p.id },
          encabezado,
          el('p', { class: 'paso-ayuda', id: idAyuda, hidden: !abierto }, p.ayuda)),
      );
    });
    const n = hechos.length;
    $('progreso-relleno').style.width = `${(100 * n) / pasos.length}%`;
    $('progreso-texto').textContent = actual ? `${n} de ${pasos.length} pasos` : `${n} de ${pasos.length} pasos · procedimiento terminado`;
    $('progreso').setAttribute('aria-valuenow', String(n));
  }

  almacen.suscribir((e, a) => {
    if (e.procedimiento.hechos !== a.procedimiento.hechos) {
      const nuevos = e.procedimiento.hechos.filter((id) => !a.procedimiento.hechos.includes(id));
      render();
      if (nuevos.length) {
        const ultimo = nuevos[nuevos.length - 1];
        const i = pasos.findIndex((p) => p.id === ultimo);
        anuncio.textContent = '';
        setTimeout(() => {
          anuncio.textContent = pasoActual(pasos, e.procedimiento.hechos) ? TP.completado(i + 1, pasos[i].titulo) : TP.terminado;
        }, 80);
        for (const id of nuevos) lista.querySelector(`[data-paso="${id}"]`)?.classList.add('recien');
      }
    }
    if (revisado && (e.montaje !== a.montaje || e.ajustes.encendido !== a.ajustes.encendido)) mostrarRevision();
  });
  render();

  return {
    render,
    /** Borra el resultado de la revisión (al empezar de nuevo). */
    olvidarRevision() {
      revisado = null;
      mostrarRevision();
    },
  };
}
