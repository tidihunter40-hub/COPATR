import { useEffect, useMemo, useState } from 'react';
import { calculateStandings } from '../dist/engine.mjs';
import { clubJourney, safeCrestUrl } from '../dist/club.mjs';
import { ESPORTS_DEMO } from '../dist/esports-demo.mjs';
// Load the real-mode module at runtime so esbuild cannot freeze its dev-time
// runtime-config.mjs values into the React bundle.
const realModeUrl = '/supabase-real-mode.mjs';
const realMode = () => import(realModeUrl);

export type Club = { id: string; name: string; crest?: string | null; demoAsset?: string; publicCrest?: string | null; shortName?: string; category?: string; notes?: string; color?: string };
export type Match = { id: string; round: number; phase?: string; leg?: number; homeId: string; awayId: string; homeScore: number | null; awayScore: number | null; status?: string; penalties?: { home: number; away: number } };
export type Competition = { name: string; season?: string; sport: string; format: string; teams: Club[]; fixtures: Match[] };
type Participation = { id: string; name: string; season: string; sport: string; position?: number | null; phase?: string | null };
type Title = { id: string; name: string; season: string; sport: string; place: number };
type Lifetime = { matches_played?: number; wins?: number; draws?: number; losses?: number; goals_for?: number; goals_against?: number; performance?: number; titles?: number; runner_ups?: number };
type Journey = { id: string; opponentId: string; played: boolean; goalsFor: number | null; goalsAgainst: number | null; outcome: string };

const PHASES: Record<string, string> = { league: 'Pontos corridos', groups: 'Fase de grupos', round_of_16: 'Oitavas de final', quarterfinal: 'Quartas de final', semifinal: 'Semifinal', third_place: 'Terceiro lugar', final: 'Final' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const phaseOf = (match: Match) => match.phase && PHASES[match.phase] ? match.phase : 'league';
const phaseName = (phase?: string | null) => phase ? PHASES[phase] || phase : 'Não registrada';
const played = (match: Match) => match.homeScore !== null && match.awayScore !== null;
const score = (match: Match) => played(match) ? `${match.homeScore} × ${match.awayScore}` : 'VS';

function Crest({ team, className = '' }: { team?: Club; className?: string }) {
  const fallback = '/assets/official/06_escudo_padrao_tr_campeonatos.webp';
  const src = safeCrestUrl(team?.crest) || team?.demoAsset || (team?.publicCrest && /^https:\/\//.test(team.publicCrest) ? team.publicCrest : null) || fallback;
  return <img className={`profile-crest ${className}`} src={src} alt={`Escudo de ${team?.name || 'equipe'}`} onError={(event) => { if (event.currentTarget.src !== new URL(fallback, location.href).href) event.currentTarget.src = fallback; }}/>
}

function Field({ match, teams, clubId }: { match: Match; teams: Club[]; clubId: string }) {
  const home = teams.find((team) => team.id === match.homeId);
  const away = teams.find((team) => team.id === match.awayId);
  return <section className="trajectory-field-section" aria-label="Campo interativo do confronto selecionado"><div className="trajectory-field-heading"><div><span className="profile-kicker">CAMPO INTERATIVO</span><h4>Confronto selecionado</h4></div><span>{phaseName(phaseOf(match))} · Rodada {match.round}{match.leg && match.leg > 1 ? ` · Jogo ${match.leg}` : ''}</span></div><div className="trajectory-pitch" role="group" aria-label={`Campo: ${home?.name || 'Mandante'} contra ${away?.name || 'Visitante'}`}><div className="pitch-markings" aria-hidden="true"><i className="pitch-border"/><i className="pitch-halfway"/><i className="pitch-center-circle"/><i className="pitch-left-box"/><i className="pitch-right-box"/><i className="pitch-left-goal"/><i className="pitch-right-goal"/></div><div className="pitch-content"><div className="pitch-match-kicker">TR CAMPEONATOS <span>•</span> {played(match) ? 'RESULTADO DA PARTIDA' : 'PARTIDA A DISPUTAR'}</div><div className="pitch-matchup">{[home, away].map((team, index) => <a className={`pitch-club ${team?.id === clubId ? 'is-profile-club' : ''}`} href={team ? `#clube-${encodeURIComponent(team.id)}` : '#demonstracao'} key={index} aria-label={`Abrir perfil de ${team?.name || 'equipe'}`}><Crest team={team}/><strong>{team?.name || 'Equipe indisponível'}</strong><small>{index === 0 ? 'MANDANTE' : 'VISITANTE'} · VER PERFIL ↗</small></a>)}<div className="pitch-score" aria-live="polite"><strong>{score(match)}</strong><span>{played(match) ? match.status === 'confirmed' ? 'CONFIRMADO' : 'FINALIZADO' : 'DATA A DEFINIR'}</span>{match.penalties && <small>Pênaltis: {match.penalties.home} × {match.penalties.away}</small>}</div></div></div></div><p className="pitch-help">Selecione uma partida na trajetória para atualizar o campo. Toque em um escudo para abrir o perfil do clube.</p></section>;
}

function Experience({ clubId, data, kind, participations, titles = [], lifetime, historyStatus = 'ready', crestOverride }: { clubId: string; data: Competition; kind: 'sample' | 'local' | 'official'; participations: Participation[]; titles?: Title[]; lifetime?: Lifetime | null; historyStatus?: string; crestOverride?: string | null }) {
  const [phaseChoice, setPhaseChoice] = useState<string | null>(null);
  const [matchChoice, setMatchChoice] = useState<string | null>(null);
  const team = data.teams.find((entry) => entry.id === clubId);
  const standings = useMemo(() => calculateStandings(data.teams, data.fixtures), [data]);
  const row = standings.find((entry) => entry.id === clubId);
  const position = standings.findIndex((entry) => entry.id === clubId) + 1;
  const matches = data.fixtures.filter((match) => match.homeId === clubId || match.awayId === clubId);
  const phases = [...new Set(matches.map(phaseOf))].sort((a, b) => Object.keys(PHASES).indexOf(a) - Object.keys(PHASES).indexOf(b));
  const activePhase = phaseChoice && phases.includes(phaseChoice) ? phaseChoice : phases[0];
  const inPhase = matches.filter((match) => phaseOf(match) === activePhase).sort((a, b) => a.round - b.round || (a.leg || 1) - (b.leg || 1));
  const activeMatch = inPhase.find((match) => match.id === matchChoice) || inPhase.find(played) || inPhase[0];
  const journey = clubJourney(data.teams, data.fixtures, clubId) as Journey[];
  const byMatch = new Map<string, Journey>(journey.map((item) => [item.id, item]));
  const official = kind === 'official';
  const numbers = official ? [lifetime?.matches_played, lifetime?.wins, lifetime?.draws, lifetime?.losses, lifetime?.goals_for, lifetime?.goals_against, lifetime?.performance] : [row?.played, row?.wins, row?.draws, row?.losses, row?.goalsFor, row?.goalsAgainst, row?.performance];
  const labels = ['Jogos', 'Vitórias', 'Empates', 'Derrotas', 'Gols pró', 'Gols contra', 'Aproveitamento'];
  if (!team) return <div className="club-profile club-profile-stage04"><div className="profile-empty">Equipe não encontrada nesta edição.</div></div>;
  const profileTeam = { ...team, publicCrest: crestOverride || team.publicCrest };
  return <article className="club-profile club-profile-stage04" style={{ '--club-accent': /^#[0-9a-fA-F]{6}$/.test(team.color || '') ? team.color : '#087cff' } as React.CSSProperties}>
    <a className="profile-back" href={kind === 'sample' ? '#previa-sistema' : '#demonstracao'}>← Voltar à {kind === 'sample' ? 'Copa TR Demonstração' : 'demonstração'}</a>
    <header className="profile-hero"><div className="profile-hero-copy"><span className="profile-kicker">PERFIL DO CLUBE · {official ? 'DADOS OFICIAIS PÚBLICOS' : kind === 'sample' ? 'SIMULAÇÃO VISUAL' : 'DEMONSTRAÇÃO LOCAL'}</span><div className="profile-identity"><div className="profile-crest-stage"><Crest team={profileTeam} className="profile-hero-crest"/></div><div><p>{data.name}{data.season ? ` · ${data.season}` : ''}</p><h3>{team.name}</h3><span>{[team.shortName, team.category, data.sport].filter(Boolean).join(' · ')}</span></div></div>{team.notes && <p className="profile-notes">{team.notes}</p>}</div><div className="profile-rank"><small>{official ? 'POSIÇÃO NA EDIÇÃO' : 'CLASSIFICAÇÃO ATUAL'}</small><strong>{position > 0 && matches.length && (!official || data.format === 'round_robin') ? `${position}º` : '—'}</strong><span>{official && data.format !== 'round_robin' ? 'Sem tabela de pontos nesta edição' : `${row?.points ?? 0} pontos nesta edição`}</span></div></header>
    <div className="profile-stats" aria-label={official ? 'Estatísticas acumuladas oficiais do clube' : 'Estatísticas da demonstração'}>{labels.map((label, index) => <div className="profile-stat" key={label}><strong>{numbers[index] ?? '—'}{index === 6 && numbers[index] != null ? '%' : ''}</strong><span>{label}</span></div>)}<div className="profile-stat"><strong>{official ? lifetime?.titles ?? titles.filter((title) => title.place === 1).length : '—'}</strong><span>Títulos oficiais</span></div><div className="profile-stat"><strong>{official ? lifetime?.runner_ups ?? titles.filter((title) => title.place === 2).length : '—'}</strong><span>Vice-campeonatos</span></div></div>
    <div className="profile-body"><div className="profile-section-head"><div><span className="profile-kicker">TRAJETÓRIA NA COMPETIÇÃO</span><h4>{data.name}</h4><p>{official ? 'Fases e resultados da edição pública selecionada.' : 'Confrontos desta demonstração; resultados sem validade oficial.'}</p></div><span className="profile-progress">{journey.filter((item) => item.played).length} de {journey.length} partidas disputadas</span></div>
      {phases.length ? <><div className="trajectory-phases" role="group" aria-label="Fases existentes na competição">{phases.map((phase) => <button type="button" key={phase} aria-pressed={phase === activePhase} onClick={() => { setPhaseChoice(phase); setMatchChoice(null); }}>{phaseName(phase)} <span>{matches.filter((match) => phaseOf(match) === phase).length}</span></button>)}</div><div className="trajectory-layout"><section className="trajectory-timeline" aria-label={`Partidas da fase ${phaseName(activePhase)}`}><div className="trajectory-timeline-head"><h5>Partidas da fase</h5><span>SELECIONE UM CONFRONTO</span></div><ol className="journey-list">{inPhase.map((match) => { const item = byMatch.get(match.id); const opponent = data.teams.find((entry) => entry.id === item?.opponentId); return <li key={match.id} className={item?.played ? 'journey-played' : 'journey-pending'}><button className={`journey-select ${match.id === activeMatch?.id ? 'is-selected' : ''}`} type="button" aria-pressed={match.id === activeMatch?.id} onClick={() => setMatchChoice(match.id)}><span className="journey-node" aria-hidden="true">{item?.played ? '✓' : '·'}</span><span className="journey-round">RODADA {String(match.round).padStart(2, '0')}{match.leg && match.leg > 1 ? ` · JOGO ${match.leg}` : ''}</span><span className="journey-opponent"><Crest team={opponent}/><strong>{opponent?.name || 'Adversário'}</strong></span><span className="journey-result">{item?.played ? `${item.goalsFor} × ${item.goalsAgainst}` : 'VS'}</span><span className={`journey-outcome ${item?.outcome?.toLowerCase().replace('ó', 'o') || ''}`}>{item?.outcome || 'A disputar'}</span></button></li>; })}</ol></section>{activeMatch && <Field match={activeMatch} teams={data.teams.map((entry) => entry.id === clubId && crestOverride ? { ...entry, publicCrest: crestOverride } : entry)} clubId={clubId}/>}</div></> : <div className="profile-empty"><h5>A trajetória começa com os confrontos.</h5><p>Esta edição ainda não possui partidas visíveis para o clube.</p></div>}
      <section className="profile-history" aria-labelledby="profile-history-title"><div className="profile-section-head"><div><span className="profile-kicker">MEMÓRIA DO CLUBE</span><h4 id="profile-history-title">Participações e conquistas</h4></div><a href="#galeria">Galeria de campeões ↗</a></div><div className="profile-history-grid"><div className="profile-history-card"><h5>Histórico de participações</h5>{participations.length ? <ul>{participations.map((part) => <li key={part.id}><span><strong>{part.name}</strong><small>{part.season ? `${part.season} · ` : ''}{part.sport}</small></span><em>{part.position ? `${part.position}º lugar` : part.phase ? phaseName(part.phase) : official ? 'Posição não registrada' : 'Simulação'}</em></li>)}</ul> : <p>{historyStatus === 'unavailable' ? 'Consulta de participações indisponível agora.' : 'Nenhuma participação pública registrada.'}</p>}</div><div className="profile-history-card"><h5>Conquistas confirmadas</h5>{titles.length ? <ul>{titles.map((title) => <li key={title.id}><span><strong>{title.place === 1 ? 'Campeão' : title.place === 2 ? 'Vice-campeão' : 'Terceiro lugar'} · {title.name}</strong><small>{title.season} · {title.sport}</small></span><em>OFICIAL</em></li>)}</ul> : <p>{official && historyStatus === 'unavailable' ? 'Consulta de títulos indisponível agora.' : 'Nenhum título oficial confirmado para este clube.'}</p>}</div></div><p className="profile-scope">{official ? 'O histórico oficial permanece vinculado ao clube e às temporadas registradas. Apenas resultados confirmados entram nas estatísticas.' : 'Esta competição é demonstrativa. Participações, resultados e títulos desta prévia não são gravados como oficiais.'}</p></section>
    </div>
  </article>;
}

function OfficialView({ id }: { id: string }) {
  const [history, setHistory] = useState<any>(null);
  const [error, setError] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const [seasonData, setSeasonData] = useState<any>(null);
  const [crest, setCrest] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; setHistory(null); setError(''); realMode().then((api) => api.getPublicClubHistory(id)).then((value) => { if (!cancelled) setHistory(value); }).catch(() => { if (!cancelled) setError('Não foi possível consultar o histórico oficial neste ambiente.'); }); return () => { cancelled = true; }; }, [id]);
  const entries = history?.entries || [];
  const selectedEntry = entries.find((entry: any) => entry.id === entryId) || entries[0];
  useEffect(() => { if (!selectedEntry?.season_id) return; let cancelled = false; setSeasonData(null); realMode().then((api) => api.getPublicSeasonJourney(selectedEntry.season_id)).then((value) => { if (!cancelled) setSeasonData({ ...value, seasonId: selectedEntry.season_id }); }).catch(() => { if (!cancelled) setSeasonData({ seasonId: selectedEntry.season_id, entries: [], matches: [], crestUrls: {}, unavailable: true }); }); return () => { cancelled = true; }; }, [selectedEntry?.season_id]);
  useEffect(() => { if (!history?.club?.crest_path) return; let cancelled = false; realMode().then((api) => api.getSignedCrestUrl(history.club.crest_path)).then((url) => { if (!cancelled) setCrest(url); }).catch(() => {}); return () => { cancelled = true; }; }, [history?.club?.crest_path]);
  if (error) return <div className="club-profile club-profile-stage04"><a className="profile-back" href="#galeria">← Voltar à galeria</a><div className="profile-empty"><h3>Histórico indisponível</h3><p>{error}</p></div></div>;
  if (!history) return <div className="club-profile club-profile-stage04"><div className="profile-empty"><h3>Carregando perfil do clube…</h3></div></div>;
  if (!history.club) return <div className="club-profile club-profile-stage04"><a className="profile-back" href="#galeria">← Voltar à galeria</a><div className="profile-empty"><h3>Clube não encontrado</h3><p>O perfil público pode não estar disponível.</p></div></div>;
  const participations: Participation[] = entries.map((entry: any) => ({ id: entry.id, name: entry.season?.competition?.name || 'Competição', season: entry.season?.label || '', sport: entry.season?.competition?.sport || history.club.sport, position: entry.final_position, phase: entry.final_phase }));
  const titles: Title[] = (history.titles || []).map((title: any) => ({ id: title.id, name: title.season?.competition?.name || 'Competição', season: title.season?.label || '', sport: title.season?.competition?.sport || history.club.sport, place: title.place }));
  const currentSeason = seasonData?.seasonId === selectedEntry?.season_id ? seasonData : null;
  const byEntry = new Map<string, any>((currentSeason?.entries || []).map((entry: any) => [entry.id, entry]));
  const teams: Club[] = (currentSeason?.entries || []).map((entry: any) => ({ id: entry.club_id, name: entry.club_name_snapshot, publicCrest: currentSeason.crestUrls?.[entry.id] || null }));
  if (!teams.some((team) => team.id === id)) teams.push({ id, name: history.club.official_name, publicCrest: crest });
  const penaltyByMatch = new Map<string, any>((currentSeason?.penalties || []).map((item: any) => [item.match_id, item]));
  const fixtures: Match[] = (currentSeason?.matches || []).map((match: any) => { const home = byEntry.get(match.home_entry_id); const away = byEntry.get(match.away_entry_id); const penalty = penaltyByMatch.get(match.id); return { id: match.id, round: match.round_number || 1, phase: match.phase, leg: match.leg_number, homeId: home?.club_id || '', awayId: away?.club_id || '', homeScore: match.status === 'confirmed' ? match.home_score : null, awayScore: match.status === 'confirmed' ? match.away_score : null, status: match.status, penalties: penalty ? { home: penalty.home_score, away: penalty.away_score } : undefined }; }).filter((match: Match) => match.homeId && match.awayId);
  const data: Competition = { name: selectedEntry?.season?.competition?.name || 'Histórico do clube', season: selectedEntry?.season?.label || '', sport: selectedEntry?.season?.competition?.sport || history.club.sport, format: selectedEntry?.season?.format || '', teams, fixtures };
  return <><div className="official-season-select"><label htmlFor="club-season-select">Edição da competição</label><select id="club-season-select" value={selectedEntry?.id || ''} onChange={(event) => setEntryId(event.target.value)} disabled={!entries.length}>{entries.length ? entries.map((entry: any) => <option key={entry.id} value={entry.id}>{entry.season?.competition?.name || 'Competição'} · {entry.season?.label || 'Temporada'}</option>) : <option value="">Nenhuma participação pública</option>}</select></div><Experience key={selectedEntry?.id || id} clubId={id} data={data} kind="official" participations={participations} titles={titles} lifetime={history.stats} historyStatus={history.entriesStatus === 'unavailable' || history.titlesStatus === 'unavailable' ? 'unavailable' : 'ready'} crestOverride={crest}/></>;
}

export function ClubProfileView({ id, localData }: { id: string; localData: Competition }) {
  if (UUID.test(id)) return <OfficialView key={id} id={id}/>;
  const sample = id.startsWith('demo-');
  const data = sample ? ESPORTS_DEMO as unknown as Competition : localData;
  const team = data.teams.find((entry) => entry.id === id);
  if (!team) return <div className="club-profile club-profile-stage04"><a className="profile-back" href="#demonstracao">← Voltar ao laboratório</a><div className="profile-empty"><h3>Equipe não encontrada</h3><p>O cadastro pode ter sido removido deste navegador.</p></div></div>;
  const participation: Participation = { id: `${sample ? 'sample' : 'local'}-${data.name}`, name: data.name || 'Demonstração local', season: data.season || '', sport: data.sport };
  return <Experience key={`${id}-${data.name}`} clubId={id} data={data} kind={sample ? 'sample' : 'local'} participations={[participation]}/>;
}
