/**
 * Archivo de registros impresos en el navegador (IndexedDB).
 *
 * Cada registro ocupa unos 0,5 MB (12 derivaciones × 20 s × 500 muestras/s), demasiado para localStorage.
 * IndexedDB guarda los Float32Array tal cual. Así los registros sobreviven a una recarga de la página.
 * Si el navegador no permite IndexedDB (ventana privada, vista previa…), los registros viven solo en memoria
 * y la aplicación lo avisa una vez.
 */
const BASE = 'laboratorio-ecg-virtual-v2';
const TABLA = 'registros';

function abrirBase() {
  return new Promise((ok, mal) => {
    let pedido;
    try {
      pedido = indexedDB.open(BASE, 1);
    } catch (e) {
      mal(e);
      return;
    }
    pedido.onupgradeneeded = () => {
      const bd = pedido.result;
      if (!bd.objectStoreNames.contains(TABLA)) bd.createObjectStore(TABLA, { keyPath: 'id' });
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
    pedido.onblocked = () => mal(new Error('Base de datos bloqueada'));
  });
}

function operar(bd, modo, fn) {
  return new Promise((ok, mal) => {
    const tx = bd.transaction(TABLA, modo);
    const tabla = tx.objectStore(TABLA);
    const resultado = fn(tabla);
    tx.oncomplete = () => ok(resultado?.result);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

/**
 * Abre el archivo. Nunca falla: si IndexedDB no está disponible, devuelve un archivo en memoria.
 * @returns {Promise<{persistente: boolean, listar: () => Promise<object[]>, guardar: (r: object) => Promise<void>,
 *                    eliminar: (id: string) => Promise<void>, vaciar: () => Promise<void>}>}
 */
export async function abrirArchivo() {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('Sin IndexedDB');
    const bd = await abrirBase();
    return {
      persistente: true,
      async listar() {
        const lista = await operar(bd, 'readonly', (t) => t.getAll());
        return (lista ?? []).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
      },
      guardar: (r) => operar(bd, 'readwrite', (t) => t.put(r)).catch(() => {}),
      eliminar: (id) => operar(bd, 'readwrite', (t) => t.delete(id)).catch(() => {}),
      vaciar: () => operar(bd, 'readwrite', (t) => t.clear()).catch(() => {}),
    };
  } catch {
    return {
      persistente: false,
      listar: async () => [],
      guardar: async () => {},
      eliminar: async () => {},
      vaciar: async () => {},
    };
  }
}
