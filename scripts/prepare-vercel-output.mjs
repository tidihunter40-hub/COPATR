import { cp, rm } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve('.');
const source = resolve(root, 'dist');
const output = resolve(root, 'vercel-dist');
if (relative(root, output).startsWith('..' + sep) || relative(root, output) === '..' || output === root) {
  throw new Error('A pasta de saída precisa ficar dentro do projeto.');
}
await rm(output, { recursive: true, force: true });
await cp(source, output, {
  recursive: true,
  filter: path => {
    const name = relative(source, path).replaceAll('\\', '/');
    return name !== 'runtime-config.mjs' && !name.endsWith('.js.map');
  },
});
console.log('Saída Vercel preparada sem configuração local e source maps.');
