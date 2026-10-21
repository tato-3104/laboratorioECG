/**
 * TEXTOS DINÁMICOS DE LA INTERFAZ (editable).
 * Los textos fijos (títulos, botones, fundamentos, ayuda) están en index.html y los pasos del procedimiento
 * en src/procedimiento/pasos.js. Aquí están los mensajes que el programa compone según lo que hace el estudiante.
 */
export const TEXTOS = {
  paciente: {
    inicial: 'Arrastre un electrodo de la bandeja al paciente.',
    colocado: (tipo, donde) => `${tipo === 'pinza' ? 'Pinza colocada' : 'Electrodo adhesivo colocado'} en ${donde}.`,
    movido: (donde) => `Electrodo movido a ${donde}.`,
    retirado: 'Electrodo retirado y devuelto a la bandeja.',
    conectado: (cable, donde) => `Cable ${cable} enganchado al electrodo de ${donde}.`,
    desconectado: (cable) => `Cable ${cable} desenganchado.`,
    sinElectrodo: 'Ahí no hay un electrodo. Coloque primero un electrodo de la bandeja y luego enganche el cable.',
    tecladoElectrodo: 'Use las flechas para ubicar el electrodo (Mayús para pasos largos). Intro para soltar, Esc para cancelar.',
    tecladoMover: 'Use las flechas para mover el electrodo. Intro para soltar, Supr para retirarlo, Esc para cancelar.',
    tecladoCable: (cable) => `Cable ${cable}: use las flechas para elegir un electrodo e Intro para engancharlo. Supr lo desengancha. Esc cancela.`,
    tecladoSinElectrodos: 'No hay electrodos colocados. Coloque uno primero.',
    destinoSuelto: 'sin enganchar',
  },
  equipo: {
    monitor: 'MONITOR',
    congelado: 'CONGELADO',
    apagado: 'APAGADO',
    iniciando: 'INICIANDO',
    sinFC: '--- lpm',
    marcaSintetica: 'SEÑAL SINTÉTICA',
    estabilizando: 'Estabilizando línea de base…',
    arrancando: 'Iniciando el equipo…',
    impresionCorta: 'Hay menos de 3 s de registro: espere unos segundos e imprima de nuevo.',
    registroGuardado: (n, nombre) => `Registro ${n} guardado: ${nombre}. Ábralo desde la pestaña «Registros».`,
    conectarTroncal: 'Cable de paciente conectado',
    desconectarTroncal: 'Cable de paciente desconectado',
    sinSenal: (faltan) => `sin señal · ${faltan}`,
    /** Aviso cuando los 20 s impresos incluyen un cambio de conexión o el equipo lleva poco encendido. */
    noUniforme: (s, faltan) =>
      `Este registro incluye un cambio de conexión de hace ${s} s, así que no corresponde a una sola condición. ` +
      `Espere ${faltan} s más sin tocar electrodos ni cables e imprima de nuevo.`,
  },
  procedimiento: {
    completado: (n, titulo) => `Paso ${n} completado: ${titulo}.`,
    terminado: 'Procedimiento terminado. Continúe con las actividades y el análisis de la guía.',
    revisionCorrecta: 'Montaje correcto: los diez electrodos están en su sitio y cada cable está en su electrodo.',
    revisionConProblemas: (n) => (n === 1 ? 'El montaje tiene 1 problema.' : `El montaje tiene ${n} problemas.`),
    revisionDesactualizada: 'El montaje cambió después de esta revisión. Vuelva a revisarlo si lo necesita.',
    equipoApagado: 'Nota: el equipo está apagado.',
    todoRetirado: 'Todos los electrodos volvieron a la bandeja.',
    pacienteGuardado: 'Datos del registro guardados.',
    sinPersistencia: 'Este navegador no permite guardar registros: se perderán al cerrar o recargar la página. Descárguelos a medida que los imprima.',
    conPersistencia: 'Los registros, el montaje y el avance se guardan en este navegador y se recuperan si recarga la página.',
  },
  registros: {
    vacio: 'Aún no hay registros. Pulse «Imprimir» en el equipo para guardar los últimos 20 s de señal.',
    sinFuente: 'Congele la pantalla del equipo o imprima un registro para medir sobre él.',
    eliminado: (n) => `Registro ${n} eliminado.`,
    comparacionVacia: 'Guarde al menos dos registros para compararlos (por ejemplo, la referencia y una conexión incorrecta).',
    limite: (n) => `Se conservan los ${n} registros más recientes; el más antiguo se descartó.`,
  },
};
