import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
async function filesUnder(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path));
    else if (entry.isFile()) found.push(path.replaceAll('\\', '/'));
  }
  return found.sort();
}

const sourceFiles = [
  '.gitignore', '.vercelignore', 'package.json', 'package-lock.json', 'vercel.json',
  ...await filesUnder('api'),
  ...await filesUnder('src'),
  ...await filesUnder('supabase/migrations'),
  ...[
    'build-optimized-css.mjs', 'build-site-css.mjs', 'build-site-pages.mjs',
    'copy-sw.mjs', 'install-graphics-mode.mjs', 'prepare-vercel-output.mjs',
    'create-rc2-manifest.mjs',
  ].map((name) => `scripts/${name}`),
].sort();
const deployFiles = (await filesUnder('vercel-dist')).map((path) => relative('vercel-dist', path).replaceAll('\\', '/'));
const hashFiles = async (files, prefix = '') => Object.fromEntries(await Promise.all(files.map(async (path) => [path, sha256(await readFile(prefix + path))])));
const sourceSha256 = await hashFiles(sourceFiles);
const deploySha256 = await hashFiles(deployFiles, 'vercel-dist/');
const treeSha256 = sha256(Object.entries(deploySha256).map(([path, hash]) => `${path}\0${hash}\n`).join(''));
const manifest = {
  version: 'corujao-8-rc2',
  previousPreviewId: 'dpl_CUZsU4XpXNVNEWzhr1bQbS4gqjRR',
  previouslyRecordedProductionId: 'dpl_DW8z1XUyEbscWEM1mDBqvG7EXYtx',
  preview: null,
  deploymentFileCount: deployFiles.length,
  deploymentTreeSha256: treeSha256,
  sourceSha256,
  deploymentFileSha256: deploySha256,
};
await writeFile('docs/corujao-8-rc2-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ version: manifest.version, deploymentFileCount: deployFiles.length, deploymentTreeSha256: treeSha256 }));
