import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Club identities are fictional and used only when a demo team has no registered crest.
const crests = [
  {
    file: 'falcon', primary: '#0757a7', secondary: '#061b39', accent: '#8ddcff',
    pattern: '<path d="M17 31 76 87M15 52 58 98" stroke="#75d8ff" stroke-opacity=".18" stroke-width="9"/>',
    symbol: '<path d="M18 44 36 39 48 47 60 39 78 44 60 51 48 70 36 51Z" fill="#f3f9ff"/><path d="m31 45 17 10 17-10-17 24Z" fill="#95dcff"/><path d="m42 47 6-5 6 5-6 4Z" fill="#06284b"/>',
  },
  {
    file: 'comet', primary: '#a3132f', secondary: '#260d21', accent: '#ffe0a4',
    pattern: '<path d="M17 77 74 24M20 92 77 39" stroke="#ffb07b" stroke-opacity=".22" stroke-width="8"/>',
    symbol: '<path d="m48 31 5.7 15.3L70 47l-12.8 10 4.2 16L48 63.6 34.6 73l4.2-16L26 47l16.3-.7Z" fill="#ffe8b3"/><path d="m48 39 3.2 9.5 10 .1-8 6.2 2.9 9.6-8.1-5.7-8.1 5.7 2.9-9.6-8-6.2 10-.1Z" fill="#fff8e9"/>',
  },
  {
    file: 'crown', primary: '#5336a2', secondary: '#16143d', accent: '#f3d17a',
    pattern: '<path d="M31 13v86M48 12v91M65 13v86" stroke="#c7a9ff" stroke-opacity=".13" stroke-width="5"/>',
    symbol: '<path d="M22 44 34 54 48 33l14 21 12-10-6 30H28Z" fill="#ffe5a3" stroke="#b88d42" stroke-width="2"/><path d="M29 70h38v7H29z" fill="#fff4d7"/><circle cx="48" cy="54" r="5" fill="#8e6ad8"/><circle cx="34" cy="61" r="3" fill="#a261d6"/><circle cx="62" cy="61" r="3" fill="#a261d6"/>',
  },
  {
    file: 'union', primary: '#087c87', secondary: '#083242', accent: '#a8f5df',
    pattern: '<path d="M13 42h70M13 61h70M13 80h70" stroke="#9de6d8" stroke-opacity=".17" stroke-width="5"/>',
    symbol: '<path d="M30 36v25c0 13 7 19 18 19s18-6 18-19V36" fill="none" stroke="#e9fff8" stroke-width="10" stroke-linejoin="round"/><path d="M34 40v22c0 10 5 14 14 14s14-4 14-14V40" fill="none" stroke="#77ddc6" stroke-width="4"/><path d="M39 40h18" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  },
  {
    file: 'thunder', primary: '#cf6515', secondary: '#372014', accent: '#ffe490',
    pattern: '<path d="M10 58 80 24M13 78 83 44" stroke="#ffda9a" stroke-opacity=".18" stroke-width="9"/>',
    symbol: '<path d="m51 27-24 34h17l-5 26 30-39H51l11-21Z" fill="#fff7d6" stroke="#f7c252" stroke-width="2" stroke-linejoin="round"/>',
  },
  {
    file: 'tide', primary: '#006ca5', secondary: '#062844', accent: '#79e9e1',
    pattern: '<circle cx="48" cy="58" r="33" fill="none" stroke="#a4eaf7" stroke-opacity=".15" stroke-width="8"/>',
    symbol: '<path d="M19 58c9-18 17-19 27-6 8 10 18 11 31-4-3 23-15 36-31 32-9-3-14-11-27-8 8-10 17-13 28-5-10-18-19-18-28-9Z" fill="#ecfdff"/><path d="M25 69c9-9 17-8 25 1 9 9 16 7 23-1" fill="none" stroke="#6ce4df" stroke-width="6" stroke-linecap="round"/>',
  },
  {
    file: 'summit', primary: '#206b45', secondary: '#102b31', accent: '#bde8a0',
    pattern: '<path d="M12 80h72M12 89h72" stroke="#cbf2bc" stroke-opacity=".18" stroke-width="5"/>',
    symbol: '<path d="M18 75 42 38l8 11 10-18 19 44Z" fill="#eaf8ed"/><path d="m42 38 8 11-6 2-6-6Zm18-7 8 16-8-5-6 7Z" fill="#a4e0c3"/><path d="M19 76c12-10 21-9 28 0 10-10 20-10 31 0" fill="none" stroke="#9fdf92" stroke-width="5"/>',
  },
  {
    file: 'orbit', primary: '#283f77', secondary: '#0b1837', accent: '#c8d8ff',
    pattern: '<path d="M16 27 79 91M79 27 16 91" stroke="#a1bcff" stroke-opacity=".13" stroke-width="10"/>',
    symbol: '<circle cx="48" cy="57" r="20" fill="#eaf1ff"/><circle cx="54" cy="52" r="18" fill="#29477b"/><path d="m28 45 3 5 6 1-4 4 1 6-6-3-5 3 1-6-4-4 6-1Z" fill="#fff"/><circle cx="68" cy="72" r="4" fill="#a6d5ff"/>',
  },
];

const shield = 'M48 4C35 12 23 13 10 17v40c0 24 14 42 38 51 24-9 38-27 38-51V17C73 13 61 12 48 4Z';
const inner = 'M48 11C36 18 27 19 17 22v35c0 20 11 34 31 43 20-9 31-23 31-43V22C69 19 60 18 48 11Z';
const dir = resolve('dist/assets/demo-crests');
await mkdir(dir, { recursive: true });
for (const crest of crests) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="224" viewBox="0 0 96 112" role="img" aria-label="Escudo fictício demonstrativo">
<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7fbff"/><stop offset=".24" stop-color="#93abc0"/><stop offset=".52" stop-color="#e6eef5"/><stop offset=".8" stop-color="#607c96"/><stop offset="1" stop-color="#f1f8ff"/></linearGradient><linearGradient id="body" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="${crest.primary}"/><stop offset="1" stop-color="${crest.secondary}"/></linearGradient><clipPath id="clip"><path d="${inner}"/></clipPath></defs>
<path d="${shield}" fill="#07182b" stroke="url(#metal)" stroke-width="3" stroke-linejoin="round"/>
<path d="${inner}" fill="url(#body)" stroke="${crest.accent}" stroke-width="1.3"/>
<g clip-path="url(#clip)">${crest.pattern}<path d="M17 21 78 21 78 29 17 29Z" fill="${crest.accent}" opacity=".17"/><path d="M18 92Q48 106 78 92" fill="none" stroke="${crest.accent}" stroke-opacity=".5" stroke-width="2"/></g>
<g stroke-linejoin="round" stroke-linecap="round">${crest.symbol}</g>
<path d="M48 4C35 12 23 13 10 17v40c0 24 14 42 38 51" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>
</svg>`;
  await writeFile(resolve(dir, `${crest.file}.svg`), svg, 'utf8');
}
console.log(`Criados ${crests.length} escudos fictícios em ${dir}`);
