/**
 * Arranque del laboratorio virtual de electrocardiografía (versión 2: procedimiento experimental).
 *
 * 1. Construye el modelo del tórax (campo torácico calibrado y vectores de las extremidades).
 * 2. Recupera el estado guardado en este navegador o crea uno nuevo: banco vacío (sin electrodos), cable de
 *    paciente desconectado y equipo apagado. El estudiante arma todo siguiendo el procedimiento.
 * 3. Crea el motor de adquisición y las vistas, y las conecta al estado central.
 * 4. Evalúa el avance del procedimiento cada vez que cambia algo (src/procedimiento/pasos.js).
 * 5. Inicia el bucle de animación: genera muestras en tiempo real y redibuja la pantalla del equipo.
 */
import { crearTorax, crearCampoToracico } from './modelo/torax.js';
import { sujetoDeVoluntario } from './modelo/vectorCardiaco.js';
import { DERIVACIONES } from './modelo/derivaciones.js';
import { MotorAdquisicion } from './equipo/adquisicion.js';
import { crearRegistro } from './equipo/registro.js';
import { EQUIPO } from './config/equipo.js';
import { VOLUNTARIO_POR_DEFECTO, buscarVoluntario, describirVoluntario } from './config/voluntarios.js';
import { LABORATORIO } from './config/laboratorio.js';
import { montajeVacio, deserializarMontaje } from './conexiones/montaje.js';
import { resolverEntradas } from './conexiones/entradas.js';
import { mensajesEquipo, validezDerivaciones } from './conexiones/diagnostico.js';
import { clasificarCondicion, CONDICIONES } from './procedimiento/condiciones.js';
import { pasosActivos, evaluarPasos } from './procedimiento/pasos.js';
import { crearAlmacen, leerGuardado, guardar, borrarGuardado } from './estado/almacen.js';
import { abrirArchivo } from './estado/archivo.js';
import { $, el, vaciar, avisar, anunciar } from './ui/dom.js';
import { crearVistaPaciente } from './ui/vistaPaciente.js';
import { crearVistaEquipo } from './ui/vistaEquipo.js';
import { crearPanelProcedimiento } from './ui/panelProcedimiento.js';
import { crearPanelEcuaciones } from './ui/panelEcuaciones.js';
import { crearVistaVector } from './ui/vistaVector.js';
import { crearCursores } from './ui/cursores.js';
import { crearRegistros } from './ui/registros.js';
import { crearHerramientas } from './ui/herramientas.js';
import { crearImpresion } from './ui/impresion.js';
import { TEXTOS } from './textos/es.js';

const TP = TEXTOS.procedimiento;
const elegir = (valor, permitidos, porDefecto) => (permitidos.includes(valor) ? valor : porDefecto);
const HERRAMIENTAS = ['cursores', 'registros', 'ecuaciones', 'vector', 'fundamentos'];

// ---------------------------------------------------------------- estado inicial
function normalizarAjustes(g) {
  const ini = EQUIPO.ajustesIniciales;
  return {
    encendido: typeof g?.encendido === 'boolean' ? g.encendido : ini.encendido,
    velocidad: elegir(g?.velocidad, EQUIPO.velocidades, ini.velocidad),
    ganancia: elegir(g?.ganancia, EQUIPO.ganancias, ini.ganancia),
    formato: elegir(g?.formato, EQUIPO.formatos.map((x) => x.id), ini.formato),
    derivacionUnica: elegir(g?.derivacionUnica, DERIVACIONES, ini.derivacionUnica),
  };
}

function estadoInicial(pasos) {
  const g = leerGuardado() ?? {};
  // Todos los estudiantes registran al mismo sujeto (config/voluntarios.js).
  const voluntario = VOLUNTARIO_POR_DEFECTO;
  const hechos = Array.isArray(g.procedimiento?.hechos) ? g.procedimiento.hechos.filter((id) => pasos.some((p) => p.id === id)) : [];
  const montaje = deserializarMontaje(g.montaje) ?? montajeVacio();
  return {
    montaje,
    ajustes: normalizarAjustes(g.ajustes),
    paciente: { voluntario, nombre: typeof g.paciente?.nombre === 'string' ? g.paciente.nombre.slice(0, 60) : '' },
    vista: elegir(g.vista, ['cuerpo', 'torax'], 'cuerpo'),
    referencias: typeof g.referencias === 'boolean' ? g.referencias : true,
    corazon: typeof g.corazon === 'boolean' ? g.corazon : false,
    herramienta: elegir(g.herramienta, HERRAMIENTAS, 'cursores'),
    derivacionSeleccionada: elegir(g.derivacionSeleccionada, DERIVACIONES, 'II'),
    procedimiento: {
      hechos,
      eventos: {
        revisionCorrecta: Boolean(g.procedimiento?.eventos?.revisionCorrecta),
        calibrado: Boolean(g.procedimiento?.eventos?.calibrado),
      },
    },
    congelado: false,
    congelada: null, // instantánea de la pantalla congelada (para medir)
    registros: [], // registros impresos (se cargan del archivo del navegador)
    fuenteCursores: null,
    zonaMovil: elegir(g.zonaMovil, ['paciente', 'equipo', 'panel'], 'panel'),
  };
}

const configMotor = (e) => ({ montaje: e.montaje, ajustes: e.ajustes });

// ---------------------------------------------------------------- arranque
async function iniciar() {
  const torax = crearTorax();
  const campo = crearCampoToracico(torax);
  const revision = LABORATORIO.revisionMontaje;
  const pasos = pasosActivos({ revisionHabilitada: revision.habilitada });
  const almacen = crearAlmacen(estadoInicial(pasos));
  const e0 = almacen.obtener();

  // Motor de adquisición. Si se reanuda una sesión con el equipo encendido, arranca con unos segundos ya
  // registrados (y estabilizados) para que la pantalla no empiece vacía.
  const v0 = buscarVoluntario(e0.paciente.voluntario);
  const motor = new MotorAdquisicion({ sujeto: sujetoDeVoluntario(v0), semilla: v0.semilla, campo });
  motor.configurar(configMotor(e0), { asentar: true });
  if (e0.ajustes.encendido) for (let k = 0; k < 40; k++) motor.generar(Math.round(0.25 * motor.fs));

  // Sincronización del motor con el estado (antes que las vistas, que leen del motor).
  let temporizadorGuardado = null;
  almacen.suscribir((e, a) => {
    if (e.montaje !== a.montaje || e.ajustes.encendido !== a.ajustes.encendido) motor.configurar(configMotor(e));
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(() => guardar(almacen.obtener()), 400);
  });

  // Avance del procedimiento: se recalcula con cada cambio (los pasos cumplidos se conservan).
  function contexto(e) {
    return {
      montaje: e.montaje,
      ajustes: e.ajustes,
      paciente: e.paciente,
      registros: e.registros,
      eventos: e.procedimiento.eventos,
      entradas: resolverEntradas(e.montaje, { encendido: e.ajustes.encendido }),
    };
  }
  function evaluar() {
    const e = almacen.obtener();
    const hechos = evaluarPasos(pasos, contexto(e), e.procedimiento.hechos);
    if (hechos.length !== e.procedimiento.hechos.length || hechos.some((id, i) => id !== e.procedimiento.hechos[i])) {
      almacen.actualizar((s) => ({ ...s, procedimiento: { ...s.procedimiento, hechos } }));
    }
  }
  almacen.suscribir((e, a) => {
    if (e.montaje !== a.montaje || e.ajustes !== a.ajustes || e.paciente !== a.paciente || e.registros !== a.registros || e.procedimiento.eventos !== a.procedimiento.eventos) {
      evaluar();
    }
  });

  // Archivo de registros del navegador
  const archivo = await abrirArchivo();
  let siguienteNumero = 1;
  try {
    const guardados = (await archivo.listar()).slice(-LABORATORIO.maxRegistros);
    siguienteNumero = guardados.reduce((m, r) => Math.max(m, r.numero ?? 0), 0) + 1;
    if (guardados.length) almacen.actualizar({ registros: guardados });
  } catch {
    /* sin registros previos */
  }
  $('aviso-almacenamiento').textContent = archivo.persistente ? TP.conPersistencia : TP.sinPersistencia;
  let avisoPersistencia = archivo.persistente;

  const metaRegistro = (e) => ({
    ajustes: e.ajustes,
    voluntario: e.paciente.voluntario,
    estudiante: e.paciente.nombre,
    montajeResumen: mensajesEquipo(resolverEntradas(e.montaje, { encendido: e.ajustes.encendido }))
      .map((m) => m.texto)
      .join(' · '),
  });

  // ---------------------------------------------------------------- vistas
  const vistaPaciente = crearVistaPaciente({ almacen, torax });

  const equipo = crearVistaEquipo({
    almacen,
    motor,
    alAbrirPaciente: abrirPaciente,
    alCongelar(congelar) {
      const e = almacen.obtener();
      if (congelar) {
        const congelada = crearRegistro(motor, metaRegistro(e), EQUIPO.duracionImpresionS);
        almacen.actualizar({ ...e, congelado: true, congelada, fuenteCursores: congelada.id });
        anunciar('Pantalla congelada. Puede medirla con la herramienta «Cursores».');
      } else {
        almacen.actualizar({ ...e, congelado: false });
      }
    },
    alCalibrar() {
      const e = almacen.obtener();
      if (!e.ajustes.encendido || e.procedimiento.eventos.calibrado) return;
      const validez = validezDerivaciones(resolverEntradas(e.montaje, { encendido: true }));
      if (!DERIVACIONES.some((d) => validez[d].valida)) return;
      almacen.actualizar((s) => ({ ...s, procedimiento: { ...s.procedimiento, eventos: { ...s.procedimiento.eventos, calibrado: true } } }));
    },
    alImprimir() {
      const e = almacen.obtener();
      if (!equipo.listo()) {
        avisar(TEXTOS.equipo.arrancando);
        return;
      }
      if ((motor.total - motor.primeraDisponible()) / motor.fs < 3) {
        avisar(TEXTOS.equipo.impresionCorta);
        return;
      }
      const condicion = e.montaje.cableTroncal ? clasificarCondicion(e.montaje, torax) : null;
      const numero = siguienteNumero++;
      const r = crearRegistro(motor, {
        ...metaRegistro(e),
        numero,
        condicion,
        etiqueta: condicion ? CONDICIONES[condicion].corto : `Registro ${numero}`,
      });
      // Se conservan los registros más recientes (cada uno ocupa ~0,5 MB).
      let registros = [...e.registros, r];
      if (registros.length > LABORATORIO.maxRegistros) {
        const sobran = registros.slice(0, registros.length - LABORATORIO.maxRegistros);
        registros = registros.slice(-LABORATORIO.maxRegistros);
        for (const x of sobran) archivo.eliminar(x.id);
        avisar(TEXTOS.registros.limite(LABORATORIO.maxRegistros));
      }
      archivo.guardar(r);
      almacen.actualizar({ ...e, registros });
      let aviso = '';
      if (!r.uniforme) {
        const s = Math.max(0, Math.floor(r.segundosSinCambios));
        aviso = TEXTOS.equipo.noUniforme(s, Math.max(1, Math.ceil(EQUIPO.duracionRitmoS - r.segundosSinCambios)));
      }
      impresion.abrir(r, aviso);
      anunciar(TEXTOS.equipo.registroGuardado(r.numero, r.etiqueta));
      if (!avisoPersistencia) {
        avisoPersistencia = true;
        setTimeout(() => avisar(TP.sinPersistencia, 6000), 400);
      }
    },
  });

  const panel = crearPanelProcedimiento({ almacen, torax, pasos, vistaPaciente, revision });
  const ecuaciones = crearPanelEcuaciones({ almacen, torax });
  const vector = crearVistaVector({ almacen });
  const cursores = crearCursores({ almacen });
  const registros = crearRegistros({
    almacen,
    alVer: (r) => impresion.abrir(r),
    alMedir: medir,
    alEliminar: (r) => archivo.eliminar(r.id),
    alRenombrar: (r) => archivo.guardar(r),
  });
  const herramientas = crearHerramientas({
    almacen,
    herramientas: { ecuaciones, vector, cursores, registros, fundamentos: { activar() {}, desactivar() {} } },
  });
  const impresion = crearImpresion({ alMedir: medir });

  function medir(id) {
    almacen.actualizar({ fuenteCursores: id });
    mostrarZona('equipo');
    herramientas.mostrar('cursores');
    $('herr-cursores').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------- datos del paciente
  const sujetoLab = buscarVoluntario(e0.paciente.voluntario);
  $('ficha-voluntario').textContent = `${describirVoluntario(sujetoLab).replace(/^./, (c) => c.toUpperCase())} · sujeto virtual sano. QTc de referencia: menor de ${sujetoLab.sexo === 'mujer' ? 460 : 440} ms.`;
  function abrirPaciente() {
    $('in-nombre').value = almacen.obtener().paciente.nombre;
    const dlg = $('dlg-paciente');
    dlg.returnValue = '';
    dlg.showModal();
  }
  $('dlg-paciente').addEventListener('close', () => {
    if ($('dlg-paciente').returnValue !== 'guardar') return;
    const nombre = $('in-nombre').value.trim().slice(0, 60);
    almacen.actualizar((s) => ({ ...s, paciente: { ...s.paciente, nombre } }));
    avisar(TP.pacienteGuardado);
  });

  // ---------------------------------------------------------------- ayuda y reinicio
  $('btn-ayuda').addEventListener('click', () => $('dlg-ayuda').showModal());
  $('btn-cerrar-ayuda').addEventListener('click', () => $('dlg-ayuda').close());
  $('btn-reiniciar').addEventListener('click', () => {
    $('confirmar-reinicio').hidden = false;
    $('btn-reiniciar-no').focus();
  });
  $('btn-reiniciar-no').addEventListener('click', () => {
    $('confirmar-reinicio').hidden = true;
    $('btn-reiniciar').focus();
  });
  let reiniciando = false;
  $('btn-reiniciar-si').addEventListener('click', async () => {
    clearTimeout(temporizadorGuardado);
    reiniciando = true;
    await archivo.vaciar();
    borrarGuardado();
    location.reload();
  });
  window.addEventListener('beforeunload', () => {
    if (!reiniciando) guardar(almacen.obtener());
  });

  // ---------------------------------------------------------------- pestañas en teléfonos
  const zonas = { paciente: $('zona-paciente'), equipo: $('zona-equipo'), panel: $('zona-panel') };
  const botonesZona = [...document.querySelectorAll('.pestanas-moviles button')];
  function mostrarZona(z) {
    for (const [k, nodo] of Object.entries(zonas)) nodo.classList.toggle('oculta-movil', k !== z);
    for (const b of botonesZona) b.setAttribute('aria-pressed', String(b.dataset.zona === z));
    if (almacen.obtener().zonaMovil !== z) almacen.actualizar({ zonaMovil: z });
  }
  for (const b of botonesZona) b.addEventListener('click', () => mostrarZona(b.dataset.zona));
  mostrarZona(e0.zonaMovil);

  // ---------------------------------------------------------------- tema (la pantalla lee sus colores de CSS)
  const recolorear = () => equipo.pantalla.recolorear();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', recolorear);
  new MutationObserver(recolorear).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Primera evaluación (por ejemplo, al reanudar una sesión guardada)
  evaluar();

  // ---------------------------------------------------------------- bucle de animación
  const movimientoReducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const intervaloDibujo = movimientoReducido ? 250 : 33; // ms
  let ultimo = performance.now();
  let ultimoDibujo = 0;
  function bucle(ahora) {
    const dt = Math.min(0.25, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    if (!almacen.obtener().congelado) motor.avanzar(dt);
    if (ahora - ultimoDibujo >= intervaloDibujo) {
      ultimoDibujo = ahora;
      equipo.cuadro(ahora);
    }
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);

  // Acceso para las pruebas automáticas (solo con ?pruebas en la dirección).
  if (new URLSearchParams(location.search).has('pruebas')) {
    window.laboratorioECG = { almacen, motor, torax, campo, cursores, vector, panel, archivo, pasos };
  }
}

iniciar();
