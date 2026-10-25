export const MAX_CREST_BYTES = 300_000;
export const MAX_TOTAL_CREST_CHARS = 2_800_000;

export function safeCrestUrl(value) {
  return typeof value === 'string' && value.length <= 410_000 &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}

export function detectCrestType(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function readCrestFile(file, teams = [], exceptId = null) {
  if (!file || !file.size) throw new Error('Selecione um escudo PNG, JPG ou WEBP.');
  if (file.size > MAX_CREST_BYTES) throw new Error('O escudo deve ter no máximo 300 KB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectCrestType(bytes);
  const extension = String(file.name || '').toLowerCase().split('.').pop();
  const expected = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension];
  if (!type || !expected || type !== expected || (file.type && file.type !== type)) {
    throw new Error('Arquivo inválido. Use um PNG, JPG ou WEBP verdadeiro.');
  }
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('Não foi possível abrir o escudo. Escolha uma imagem válida.'); }
    const dimensionsValid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 2048 && bitmap.height <= 2048;
    bitmap.close();
    if (!dimensionsValid) throw new Error('O escudo deve ter até 2048 × 2048 pixels.');
  }
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  const url = `data:${type};base64,${btoa(binary)}`;
  const otherSize = teams.filter((team) => team.id !== exceptId).reduce((sum, team) => sum + (safeCrestUrl(team.crest)?.length || 0), 0);
  if (otherSize + url.length > MAX_TOTAL_CREST_CHARS) throw new Error('O armazenamento local de escudos está cheio. Use imagens menores.');
  return url;
}

export function clubJourney(teams, fixtures, teamId) {
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return fixtures.filter((match) => match.homeId === teamId || match.awayId === teamId)
    .sort((a, b) => a.round - b.round || String(a.id).localeCompare(String(b.id)))
    .map((match) => {
      const home = match.homeId === teamId;
      const opponentId = home ? match.awayId : match.homeId;
      const played = match.homeScore !== null && match.awayScore !== null;
      const goalsFor = played ? Number(home ? match.homeScore : match.awayScore) : null;
      const goalsAgainst = played ? Number(home ? match.awayScore : match.homeScore) : null;
      return {
        id: match.id, round: match.round, home, opponentId,
        opponent: names.get(opponentId) || 'Equipe removida',
        played, goalsFor, goalsAgainst,
        outcome: !played ? 'A disputar' : goalsFor > goalsAgainst ? 'Vitória' : goalsFor < goalsAgainst ? 'Derrota' : 'Empate',
      };
    });
}
