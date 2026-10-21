/**
 * Pestañas de herramientas (Cursores, Registros, Ecuaciones, Vector cardíaco, Fundamentos).
 * Solo la herramienta visible se mantiene actualizada; las demás se recalculan al mostrarlas.
 */
import { $ } from './dom.js';

/**
 * @param {{almacen: object, herramientas: Record<string, {activar: Function, desactivar: Function, cuadro?: Function}>}} op
 */
export function crearHerramientas({ almacen, herramientas }) {
  const pestanas = [...document.querySelectorAll('.pestanas [role="tab"]')];
  let actual = null;

  function mostrar(nombre, { foco = false } = {}) {
    if (!pestanas.some((p) => p.dataset.herramienta === nombre)) nombre = 'cursores';
    for (const p of pestanas) {
      const sel = p.dataset.herramienta === nombre;
      p.setAttribute('aria-selected', String(sel));
      p.tabIndex = sel ? 0 : -1;
      $(p.getAttribute('aria-controls')).hidden = !sel;
      if (sel && foco) p.focus();
    }
    if (actual !== nombre) {
      herramientas[actual]?.desactivar();
      actual = nombre;
      herramientas[nombre]?.activar();
    }
    if (almacen.obtener().herramienta !== nombre) almacen.actualizar({ herramienta: nombre });
  }

  pestanas.forEach((p, i) => {
    p.addEventListener('click', () => mostrar(p.dataset.herramienta));
    p.addEventListener('keydown', (ev) => {
      const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 }[ev.key];
      if (destino === undefined) return;
      ev.preventDefault();
      const j = (destino + pestanas.length) % pestanas.length;
      mostrar(pestanas[j].dataset.herramienta, { foco: true });
    });
  });

  mostrar(almacen.obtener().herramienta);

  return {
    mostrar,
    actual: () => actual,
  };
}
