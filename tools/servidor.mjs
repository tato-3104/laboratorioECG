/**
 * Servidor estático mínimo para probar el laboratorio en el propio computador (sin dependencias).
 *   node tools/servidor.mjs            → http://localhost:8080
 *   node tools/servidor.mjs 3000       → otro puerto
 * Los módulos de JavaScript no funcionan abriendo index.html con doble clic (file://); por eso hace falta un servidor.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let archivo = normalize(join(RAIZ, ruta));
    if (!archivo.startsWith(RAIZ)) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    if ((await stat(archivo).catch(() => null))?.isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(PUERTO, () => {
  console.log(`Laboratorio virtual de ECG en http://localhost:${PUERTO}  (Ctrl+C para detener)`);
});
