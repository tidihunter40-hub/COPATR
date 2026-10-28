import { writeFile } from 'node:fs/promises';

const pick = (base, width) => `image-set(url('${base}-${width}.avif') type('image/avif'), url('${base}-${width}.webp') type('image/webp'))`;
const rules = [
  `html[data-page="inicio"] .hero{background-image:linear-gradient(90deg,#020813d9 0%,#03102255 43%,#02081735 69%,#020914b5 100%),${pick('/assets/stadium-night', 1600)}}`,
  `html[data-page="campeonatos"] .championships-hero{background-image:linear-gradient(90deg,#020914 0%,#04101ce8 34%,#04132264 57%,#04101c12 100%),${pick('/assets/home/championship-trophy-banner', 1280)}}`,
  `html[data-page="como-funciona"] .how-hero{background-image:linear-gradient(90deg,#020711 0%,#031025e9 33%,#0310252c 62%,#00122610),${pick('/assets/home/how-it-works-hero-v1', 1600)}}`,
];
for (let index = 1; index <= 15; index += 1) {
  const selector = `.public-competition .public-fixture.match-arena.demo-arena--${index},.public-competition .public-detail-page>.public-fixture.match-arena.demo-arena--${index}`;
  const base = `/assets/tr-stadiums/selected/${index}`;
  rules.push(`${selector}{background-image:linear-gradient(180deg,#020c1850 0%,#020b1470 100%),${pick(base, 1440)}!important}`);
}
for (let index = 1; index <= 3; index += 1) {
  rules.push(`.premium-stats .public-stats-grid>div:nth-child(${index}){--stat-image:${pick(`/assets/tr-stadiums/selected/${index + 6}`, 720)}}`);
}
rules.push('@media(max-width:700px){');
rules.push(`html[data-page="inicio"] .hero{background-image:linear-gradient(90deg,#020813d9 0%,#03102255 43%,#02081735 69%,#020914b5 100%),${pick('/assets/stadium-night', 800)}}`);
rules.push(`html[data-page="campeonatos"] .championships-hero{background-image:linear-gradient(90deg,#020914 0%,#04101ce8 48%,#04101c80 100%),${pick('/assets/home/championship-trophy-banner', 640)}}`);
rules.push(`html[data-page="como-funciona"] .how-hero{background-image:linear-gradient(90deg,#020711 0%,#031025e9 33%,#0310252c 62%,#00122610),${pick('/assets/home/how-it-works-hero-v1', 800)}}`);
for (let index = 1; index <= 15; index += 1) {
  const selector = `.public-competition .public-fixture.match-arena.demo-arena--${index},.public-competition .public-detail-page>.public-fixture.match-arena.demo-arena--${index}`;
  rules.push(`${selector}{background-image:linear-gradient(180deg,#020c1850 0%,#020b1470 100%),${pick(`/assets/tr-stadiums/selected/${index}`, 720)}!important}`);
}
rules.push('}');
await writeFile('dist/optimized-images.css', rules.join('\n') + '\n');
