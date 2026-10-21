/**
 * Genera versiones autocontenidas del laboratorio (sin dependencias: solo Node).
 *
 *   node tools/construir-archivo-unico.mjs
 *
 *   dist/laboratorio-ecg.html  Un solo archivo HTML con todo dentro (estilos, fuentes, ícono y código).
 *                              Se abre con doble clic, sin servidor, y se puede subir a un aula virtual.
 *   dist/vista-previa.html     El mismo contenido como fragmento de página (sin <html>, <head> ni <body>),
 *                              para la vista previa publicada en Claude. Allí no se puede imprimir ni
 *                              descargar, así que esos botones se ocultan (clase «vista-previa»).
 *
 * Cómo se empaqueta el código: cada módulo de src/ se envuelve en su propia función (su propio ámbito),
 * en el orden de sus dependencias, y sus «import { a, b } from './x.js'» se convierten en
 * «const { a, b } = módulo_x». Solo admite la sintaxis que usa este proyecto: import con llaves desde
 * rutas relativas y «export» delante de function, const, let o class.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(RAIZ, 'dist');

const RE_IMPORT = /^import\s*\{([\s\S]*?)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"];?[ \t]*$/gm;
const RE_EXPORT = /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

/** Lee un módulo y sus dependencias (recursivo) y devuelve la lista en orden de evaluación. */
async function grafo(entrada) {
  const orden = [];
  const estado = new Map(); // ruta → 'visitando' | 'listo'
  const modulos = new Map();
  async function visitar(ruta) {
    if (estado.get(ruta) === 'listo') return;
    if (estado.get(ruta) === 'visitando') throw new Error(`Dependencia circular en ${relative(RAIZ, ruta)}`);
    estado.set(ruta, 'visitando');
    const codigo = await readFile(ruta, 'utf8');
    const imports = [...codigo.matchAll(RE_IMPORT)].map((m) => ({
      texto: m[0],
      nombres: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      ruta: resolve(dirname(ruta), m[2]),
    }));
    for (const i of imports) await visitar(i.ruta);
    modulos.set(ruta, { ruta, codigo, imports });
    estado.set(ruta, 'listo');
    orden.push(ruta);
  }
  await visitar(entrada);
  return orden.map((r) => modulos.get(r));
}

/** Empaqueta los módulos en un solo script clásico. */
async function empaquetar(entrada) {
  const modulos = await grafo(entrada);
  const nombreDe = new Map(modulos.map((m, k) => [m.ruta, `__modulo${k}`]));
  let salida = "'use strict';\n";
  for (const m of modulos) {
    let codigo = m.codigo;
    const exportados = [...codigo.matchAll(RE_EXPORT)].map((x) => x[2]);
    if (/^export\s/m.test(codigo.replace(RE_EXPORT, ''))) throw new Error(`Sintaxis de export no admitida en ${relative(RAIZ, m.ruta)}`);
    codigo = codigo.replace(RE_EXPORT, (_, tipo, nombre) => `${tipo} ${nombre}`);
    const cabecera = m.imports
      .map((i) => {
        const partes = i.nombres.map((n) => {
          const [orig, alias] = n.split(/\s+as\s+/);
          return alias ? `${orig}: ${alias}` : orig;
        });
        return `const { ${partes.join(', ')} } = ${nombreDe.get(i.ruta)};`;
      })
      .join('\n');
    codigo = codigo.replace(RE_IMPORT, '');
    salida += `\n// ===== ${relative(RAIZ, m.ruta).replaceAll('\\', '/')}\nconst ${nombreDe.get(m.ruta)} = (() => {\n${cabecera}\n${codigo}\nreturn { ${exportados.join(', ')} };\n})();\n`;
  }
  return salida.replace(/<\/script/gi, '<\\/script');
}

/** CSS con las fuentes incrustadas como data: URI. */
async function estilos() {
  let css = '';
  for (const archivo of ['css/tokens.css', 'css/estilos.css']) {
    let texto = await readFile(join(RAIZ, archivo), 'utf8');
    const urls = [...texto.matchAll(/url\('(\.\.\/assets\/fuentes\/[^']+\.woff2)'\)/g)];
    for (const [completo, ruta] of urls) {
      const datos = await readFile(resolve(join(RAIZ, 'css'), ruta));
      texto = texto.replace(completo, `url('data:font/woff2;base64,${datos.toString('base64')}')`);
    }
    css += `/* ${archivo} */\n${texto}\n`;
  }
  return css;
}

async function construir() {
  const html = await readFile(join(RAIZ, 'index.html'), 'utf8');
  const css = await estilos();
  const js = await empaquetar(join(RAIZ, 'src/main.js'));
  const icono = (await readFile(join(RAIZ, 'assets/icono.svg'))).toString('base64');
  const completo = html
    .replace(/<link rel="stylesheet" href="css\/tokens.css">\s*<link rel="stylesheet" href="css\/estilos.css">/, () => `<style>\n${css}</style>`)
    .replace(/<link rel="icon" href="assets\/icono.svg" type="image\/svg\+xml">/, `<link rel="icon" href="data:image/svg+xml;base64,${icono}" type="image/svg+xml">`)
    .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script>\n${js}</script>`);
  if (completo.includes('src="src/') || completo.includes('href="css/')) throw new Error('No se pudieron reemplazar todas las referencias de index.html');
  await mkdir(DIST, { recursive: true });
  await writeFile(join(DIST, 'laboratorio-ecg.html'), completo);

  // Fragmento para la vista previa: título y meta primero, luego estilos, contenido y código.
  const titulo = /<title>[\s\S]*?<\/title>/.exec(completo)[0];
  const metaLados = /<meta name="claude:viewport-fit-sides"[^>]*>/.exec(completo)[0];
  const cuerpo = /<body>([\s\S]*)<\/body>/.exec(completo)[1];
  const fragmento = [
    titulo,
    metaLados,
    "<script>document.documentElement.classList.add('vista-previa');</script>",
    `<style>\n${css}</style>`,
    cuerpo.trim(),
  ].join('\n');
  await writeFile(join(DIST, 'vista-previa.html'), fragmento);
  const kb = (t) => `${Math.round(Buffer.byteLength(t) / 1024)} KB`;
  console.log(`dist/laboratorio-ecg.html (${kb(completo)}) y dist/vista-previa.html (${kb(fragmento)}) generados.`);
}

construir().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
