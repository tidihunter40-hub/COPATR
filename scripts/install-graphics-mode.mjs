import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';

await copyFile('src/graphics-mode.mjs', 'dist/graphics-mode.mjs');
const css = await readFile('src/graphics-mode.css', 'utf8');
const stadiumRules = [];
const mobileStadiumRules = [];
for (let index = 1; index <= 15; index += 1) {
  const selector = `html[data-graphics="ultra"] .public-competition .public-fixture.match-arena.demo-arena--${index}.tr-arena-visible,html[data-graphics="ultra"] .public-competition .public-detail-page>.public-fixture.match-arena.demo-arena--${index}.tr-arena-visible`;
  stadiumRules.push(`${selector}{background-image:linear-gradient(180deg,#020c1818 0%,#020b1430 100%),url('/assets/tr-stadiums/selected/${index}-ultra.webp')!important}`);
  mobileStadiumRules.push(`${selector}{background-image:linear-gradient(180deg,#020c1818 0%,#020b1430 100%),url('/assets/tr-stadiums/selected/${index}-ultra-840.webp')!important}`);
  const performanceSelector = `html[data-graphics="performance"] .public-competition .public-fixture.match-arena.demo-arena--${index}.tr-arena-visible,html[data-graphics="performance"] .public-competition .public-detail-page>.public-fixture.match-arena.demo-arena--${index}.tr-arena-visible`;
  const imageSet = (width) => `image-set(url('/assets/tr-stadiums/selected/${index}-${width}.avif') type('image/avif'),url('/assets/tr-stadiums/selected/${index}-${width}.webp') type('image/webp'))`;
  const background = (width) => `background-image:linear-gradient(180deg,#020c1870 0%,#020b1480 100%),${imageSet(width)}!important`;
  stadiumRules.push(`${performanceSelector}{${background(1440)}}`);
  mobileStadiumRules.push(`${performanceSelector}{${background(720)}}`);
}
await writeFile('dist/graphics-mode.css', css + '\n' + stadiumRules.join('\n') + '\n@media(max-width:700px){' + mobileStadiumRules.join('\n') + '}\n');

const boot = `<script>try{var trGraphicsMode=localStorage.getItem('tr-campeonatos-graphics-mode');document.documentElement.dataset.graphics=trGraphicsMode==='performance'?'performance':'ultra'}catch{document.documentElement.dataset.graphics='ultra'}</script>`;
const pagePreload = `const mobile=matchMedia('(max-width:700px)').matches;const pageImage=(document.documentElement.dataset.graphics==='ultra'?{inicio:mobile?'/assets/stadium-night-800.avif':'/assets/stadium-night.webp',campeonatos:'/assets/home/championship-trophy-banner.webp','como-funciona':'/assets/home/how-it-works-hero-v1.png'}:{inicio:['/assets/stadium-night-800.avif','/assets/stadium-night-1600.avif'],campeonatos:['/assets/home/championship-trophy-banner-640.avif','/assets/home/championship-trophy-banner-1280.avif'],'como-funciona':['/assets/home/how-it-works-hero-v1-800.avif','/assets/home/how-it-works-hero-v1-1600.avif']})[document.documentElement.dataset.page];if(pageImage){const hint=document.createElement('link');hint.rel='preload';hint.as='image';hint.href=typeof pageImage==='string'?pageImage:pageImage[mobile?0:1];hint.type=hint.href.endsWith('.avif')?'image/avif':hint.href.endsWith('.png')?'image/png':'image/webp';hint.fetchPriority='high';document.head.append(hint)}</script>`;

for (const file of (await readdir('dist')).filter((name) => name.endsWith('.html'))) {
  const path = `dist/${file}`;
  let html = await readFile(path, 'utf8');
  if (!html.includes('tr-campeonatos-graphics-mode')) html = html.replace('<head>', `<head>${boot}`);
  if (html.includes('const pageImage=')) html = html.replace(/(?:const mobile=matchMedia\('\(max-width:700px\)'\)\.matches;)*const pageImage=.*?<\/script>/s, pagePreload);
  if (file === 'competition.html') {
    html = html.replace(/<link rel="preload" as="image" href="\/assets\/stadium-night-(?:800|1600)\.avif"[^>]*>/g, '');
    html = html.replace('</head>', '<link rel="preload" as="image" href="/assets/stadium-night-800.avif" type="image/avif" media="(max-width:700px)" fetchpriority="high"><link rel="preload" as="image" href="/assets/stadium-night-1600.avif" type="image/avif" media="(min-width:701px)" fetchpriority="high"></head>');
  }
  if (!html.includes('href="/graphics-mode.css"')) html = html.replace('</head>', '<link rel="stylesheet" href="/graphics-mode.css"></head>');
  if (!html.includes('src="/graphics-mode.mjs"')) html = html.replace('</body>', '<script type="module" src="/graphics-mode.mjs"></script></body>');
  await writeFile(path, html);
}
