// Fixed, in-memory identity for the public demonstration. It is never read
// from or written to Supabase, so user clubs stay completely separate.
export const DEMO_TEAMS = Object.freeze([
  { id: 'demo-bonoco-city', name: 'BONOCO CITY', demoAsset: '/assets/demo-teams/01_Bonoco_City-256.webp' },
  { id: 'demo-resenha-clube', name: 'RESENHA CLUBE', demoAsset: '/assets/demo-teams/02_Resenha_Clube-256.webp' },
  { id: 'demo-irmandade-es', name: 'IRMANDADE ES', demoAsset: '/assets/demo-teams/03_Irmandade_ES-256.webp' },
  { id: 'demo-aguia-es', name: 'ÁGUIA ES', demoAsset: '/assets/demo-teams/04_Aguia_ES-256.webp' },
  { id: 'demo-os-superstais', name: 'OS SUPERSTAIS', demoAsset: '/assets/demo-teams/05_Os_Superstais-256.webp' },
  { id: 'demo-garotos-pombal', name: 'GAROTOS DE POMBAL', demoAsset: '/assets/demo-teams/06_Garotos_de_Pombal-256.webp' },
]);

export const DEMO_TEAM_NAMES = Object.freeze(DEMO_TEAMS.map((team) => team.name));
