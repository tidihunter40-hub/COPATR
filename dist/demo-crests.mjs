export const DEMO_CRESTS = Object.freeze([
  'falcon', 'comet', 'crown', 'union', 'thunder', 'tide', 'summit', 'orbit',
]);

export function demoCrestPath(team) {
  if (!team) return null;
  const name = String(team.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const known = [
    [/falco/, 'falcon'],
    [/atletico/, 'comet'],
    [/real sports/, 'crown'],
    [/uniao/, 'union'],
  ].find(([pattern]) => pattern.test(name));
  let selected = known?.[1];
  if (!selected) {
    const key = String(team.id || team.name || 'demo');
    let hash = 0;
    for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    selected = DEMO_CRESTS[hash % DEMO_CRESTS.length];
  }
  return `/assets/demo-crests/${selected}.svg`;
}
