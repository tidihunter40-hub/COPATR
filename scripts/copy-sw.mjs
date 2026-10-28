import { copyFile } from 'node:fs/promises';
await copyFile('src/sw.js', 'dist/sw.js');
