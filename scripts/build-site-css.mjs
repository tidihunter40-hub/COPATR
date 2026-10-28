import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Order matches the established cascade in index.html.
const files = [
  'local-fonts.css', 'styles.css', 'homepage-premium.css', 'showcase.css',
  'identity-premium.css', 'lab-premium.css', 'club-profile.css',
  'classification-reference.css', 'system-pages.css', 'landing-v2.css',
  'refinement.css', 'dashboard-premium.css', 'dashboard-stage03.css',
  'dashboard-stage031.css', 'dashboard-stage032.css', 'dashboard-stage033.css',
  'club-stage04.css', 'gallery-stage05.css', 'visual-stage06.css',
  'route-pages.css', 'home-stage02.css', 'auth-header.css',
  'public-showcase.css', 'championships-catalog.css', 'how-it-works.css',
  'home-art-direction.css', 'how-it-works-fidelity.css', 'legacy-premium.css',
  'optimized-images.css',
];
const routeStyles = {
  home: new Set([
    'local-fonts.css', 'styles.css', 'homepage-premium.css', 'identity-premium.css',
    'landing-v2.css', 'refinement.css', 'dashboard-premium.css', 'route-pages.css',
    'home-stage02.css', 'auth-header.css', 'home-art-direction.css',
    'legacy-premium.css', 'optimized-images.css',
  ]),
  catalog: new Set([
    'local-fonts.css', 'styles.css', 'homepage-premium.css', 'identity-premium.css',
    'landing-v2.css', 'refinement.css', 'route-pages.css', 'auth-header.css',
    'public-showcase.css', 'championships-catalog.css', 'home-art-direction.css',
    'optimized-images.css',
  ]),
  how: new Set([
    'local-fonts.css', 'styles.css', 'homepage-premium.css', 'identity-premium.css',
    'landing-v2.css', 'refinement.css', 'route-pages.css', 'auth-header.css',
    'how-it-works.css', 'home-art-direction.css', 'how-it-works-fidelity.css',
    'optimized-images.css',
  ]),
};

const source = new Map(await Promise.all(files.map(async (file) => [file, await readFile(`dist/${file}`, 'utf8')])));
for (const [name, selected] of Object.entries({ site: new Set(files), ...routeStyles })) {
  const css = files.filter((file) => selected.has(file)).map((file) => source.get(file)).join('\n');
  const output = await transform(css, { loader: 'css', minify: true, target: ['chrome100', 'firefox100', 'safari16'] });
  const path = name === 'site' ? 'dist/site.css' : `dist/site-${name}.css`;
  await writeFile(path, output.code);
  console.log(`${path}: ${Buffer.byteLength(css)} → ${Buffer.byteLength(output.code)} bytes, ${selected.size} arquivos → 1.`);
}
