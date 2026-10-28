import { readFile, writeFile } from 'node:fs/promises';

const home = await readFile('dist/index.html', 'utf8');
const marker = '<link rel="stylesheet" href="/site-home.css">';
if (!home.includes(marker)) throw new Error('Folha CSS inicial ausente em dist/index.html.');

for (const [page, css] of [
  ['catalog.html', 'site-catalog.css'],
  ['how.html', 'site-how.css'],
  ['site-all.html', 'site.css'],
]) {
  await writeFile(`dist/${page}`, home.replace(marker, `<link rel="stylesheet" href="/${css}">`));
}
