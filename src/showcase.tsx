import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateStandings, generateFixtures, updateResult } from '../dist/engine.mjs';
import { safeCrestUrl } from '../dist/club.mjs';
import { demoCrestPath } from '../dist/demo-crests.mjs';
import { ESPORTS_DEMO } from '../dist/esports-demo.mjs';
import { DEMO_TEAMS } from '../dist/demo-teams.mjs';
import './club-profile';

type Team = { id: string; name: string; crest?: string | null; demoAsset?: string; shortName?: string; category?: string };
type Fixture = {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  history?: unknown[];
};
type DemoState = { name: string; season?: string; sport: string; format: string; teams: Team[]; fixtures: Fixture[] };
type Standing = ReturnType<typeof calculateStandings>[number];
type TabKey = 'dashboard' | 'championships' | 'matches' | 'standings' | 'statistics';
type GlyphName = 'trophy' | 'team' | 'calendar' | 'chart' | 'ball' | 'basket' | 'volley' | 'handball' | 'gamepad' | 'portal';

const STORAGE_KEY = 'tr-campeonatos-demo-v1';
const OFFICIAL_SYMBOL = '/assets/official/02_simbolo_sem_bola_transparente.png';
const SAMPLE_TEAMS: Team[] = DEMO_TEAMS.map((team) => ({ ...team }));
const sampleSchedule = generateFixtures(SAMPLE_TEAMS) as Fixture[];
const SAMPLE_FIXTURES = updateResult(
  updateResult(sampleSchedule, sampleSchedule[0].id, 2, 1),
  sampleSchedule[1].id, 1, 1,
) as Fixture[];
const SAMPLE_STATE: DemoState = {
  name: 'Copa TR Demonstração', sport: 'Futebol', format: 'single',
  teams: SAMPLE_TEAMS, fixtures: SAMPLE_FIXTURES,
};

function readLocalDemo(): DemoState {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object' && 'teams' in saved && 'fixtures' in saved &&
        Array.isArray(saved.teams) && Array.isArray(saved.fixtures)) {
      const data = saved as Partial<DemoState>;
      return {
        name: typeof data.name === 'string' ? data.name : '',
        season: typeof data.season === 'string' ? data.season : '',
        sport: typeof data.sport === 'string' ? data.sport : 'Futebol',
        format: data.format === 'double' ? 'double' : 'single',
        teams: data.teams as Team[], fixtures: data.fixtures as Fixture[],
      };
    }
  } catch { /* The existing laboratory handles unavailable or malformed storage. */ }
  return { name: '', sport: 'Futebol', format: 'single', teams: [], fixtures: [] };
}

function useLocalDemo() {
  const [demo, setDemo] = useState(readLocalDemo);
  useEffect(() => {
    const refresh = () => setDemo(readLocalDemo());
    window.addEventListener('tr:demo-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('tr:demo-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return demo;
}

function usePresentation(source: 'esports' | 'local') {
  const local = useLocalDemo();
  const hasLocal = Boolean(local.name || local.teams.length || local.fixtures.length);
  const data = source === 'esports' ? ESPORTS_DEMO as unknown as DemoState : hasLocal ? local : SAMPLE_STATE;
  let standings: Standing[] = [];
  try { standings = calculateStandings(data.teams, data.fixtures); } catch { /* Keep the presentation available if browser data was corrupted. */ }
  return { data, standings, hasLocal: source === 'local' && hasLocal, label: source === 'esports' ? 'Copa TR Demonstração · simulação visual' : hasLocal ? 'Dados da demonstração neste navegador' : 'Exemplo fictício' };
}

function Glyph({ name, size = 24 }: { name: GlyphName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  if (name === 'trophy') return <svg {...common}><path d="M9 5h14v9a7 7 0 0 1-14 0V5Z M9 8H5v3c0 4 2 6 5 6 M23 8h4v3c0 4-2 6-5 6 M16 21v5 M11 27h10" /></svg>;
  if (name === 'team') return <svg {...common}><circle cx="12" cy="11" r="4"/><path d="M4 26v-2c0-4 3.5-7 8-7s8 3 8 7v2 M22 7a4 4 0 0 1 0 8 M23 18c3 1 5 3 5 6v2"/></svg>;
  if (name === 'calendar') return <svg {...common}><rect x="5" y="7" width="22" height="20" rx="2"/><path d="M10 4v6 M22 4v6 M5 13h22 M10 18h4 M18 18h4 M10 23h4"/></svg>;
  if (name === 'chart') return <svg {...common}><path d="M5 27h22 M8 24v-7h4v7 M15 24V9h4v15 M22 24V5h4v19"/></svg>;
  if (name === 'ball') return <svg {...common}><circle cx="16" cy="16" r="12"/><path d="m12 10 4-3 4 3-1.5 5h-5L12 10Z M13.5 15 9 19l2 5 M18.5 15l4.5 4-2 5 M11 24l5 3 5-3 M7 10l5 0 M20 10h5"/></svg>;
  if (name === 'basket') return <svg {...common}><circle cx="16" cy="16" r="12"/><path d="M4 16h24 M16 4v24 M7 8c5 3 7 7 7 12 M25 8c-5 3-7 7-7 12 M7 24c5-3 7-7 7-12 M25 24c-5-3-7-7-7-12"/></svg>;
  if (name === 'volley') return <svg {...common}><circle cx="16" cy="16" r="12"/><path d="M7 8c7 0 12 3 15 9 M12 5c-2 6-1 11 2 16 M25 8c-5 2-8 6-9 12 M7 24c5-2 9-2 15 0"/></svg>;
  if (name === 'handball') return <svg {...common}><circle cx="19" cy="11" r="6"/><path d="M5 27v-8c0-2 3-2 3 0v2-9c0-2 3-2 3 0v7-10c0-2 3-2 3 0v10-7c0-2 3-2 3 0v8l2-3c2-2 5 0 3 3l-4 7H5Z"/></svg>;
  if (name === 'gamepad') return <svg {...common}><path d="M9 11h14c3 0 5 2 6 6l1 6c.5 3-3 5-5 3l-4-4H11l-4 4c-2 2-5.5 0-5-3l1-6c1-4 3-6 6-6Z M9 17h7 M12.5 13.5v7 M22 16h.1 M25 19h.1"/></svg>;
  return <svg {...common}><rect x="4" y="6" width="24" height="20" rx="2"/><path d="M4 12h24 M14 19h9 M19 15l4 4-4 4 M9 19h1"/></svg>;
}

function Heading({ eyebrow, title, accent, description }: { eyebrow: string; title: string; accent?: string; description?: string }) {
  return <div className="section-heading premium-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title} {accent && <em>{accent}</em>}</h2></div>{description && <p>{description}</p>}</div>;
}

function Crest({ team }: { team?: Team }) {
  const src = safeCrestUrl(team?.crest);
  if (src) return <img className="demo-crest" src={src} alt={`Escudo de ${team?.name}`}/>;
  if (team?.demoAsset) return <img className="demo-crest demo-crest-esports" src={team.demoAsset} alt={`Escudo de ${team.name}`}/>;
  const illustrative = demoCrestPath(team);
  return illustrative ? <span className="demo-crest demo-crest-illustrative" role="img" aria-label={`Escudo fictício demonstrativo para ${team?.name}; nenhum escudo cadastrado`}><img src={illustrative} alt="" aria-hidden="true"/><small>DEMO</small></span> : <span className="demo-crest" role="img" aria-label="Equipe removida, sem escudo">?</span>;
}

function ClubName({ team, hasLocal }: { team?: Team; hasLocal: boolean }) {
  const content = <><Crest team={team}/>{team?.name || 'Equipe'}</>;
  return (hasLocal || team?.demoAsset) && team ? <a className="showcase-club-link" href={`#clube-${encodeURIComponent(team.id)}`}>{content}</a> : <span className="showcase-club-static">{content}</span>;
}

function LabLink({ tab = 'config', children, className = '' }: { tab?: 'config' | 'matches' | 'standings' | 'portal'; children: ReactNode; className?: string }) {
  return <a href="#demonstracao" className={className} onClick={() => window.dispatchEvent(new CustomEvent('tr:open-lab-tab', { detail: tab }))}>{children}</a>;
}

function EmptyPanel({ icon, title, children, tab = 'config' }: { icon: GlyphName; title: string; children: ReactNode; tab?: 'config' | 'matches' | 'standings' | 'portal' }) {
  return <div className="showcase-empty"><span className="showcase-empty-icon"><Glyph name={icon} size={30}/></span><h3>{title}</h3><p>{children}</p><LabLink tab={tab} className="inline-action">Abrir laboratório <span aria-hidden="true">↗</span></LabLink></div>;
}

const TABS: { key: TabKey; label: string; icon: GlyphName }[] = [
  { key: 'dashboard', label: 'Painel do organizador', icon: 'chart' },
  { key: 'championships', label: 'Campeonatos', icon: 'trophy' },
  { key: 'matches', label: 'Partidas', icon: 'calendar' },
  { key: 'standings', label: 'Classificação', icon: 'chart' },
  { key: 'statistics', label: 'Estatísticas', icon: 'ball' },
];

function MiniMatches({ data, limit = 3, hasLocal = false }: { data: DemoState; limit?: number; hasLocal?: boolean }) {
  const names = new Map(data.teams.map((team) => [team.id, team]));
  const matches = data.fixtures.slice(0, limit);
  return matches.length ? <div className="showcase-match-list">{matches.map((match) => {
    const played = match.homeScore !== null && match.awayScore !== null;
    return <div className="showcase-match" key={match.id}><span className="match-round">Rodada {match.round}</span><div className="showcase-match-main"><span><ClubName team={names.get(match.homeId)} hasLocal={hasLocal}/></span><strong>{played ? `${match.homeScore} × ${match.awayScore}` : '×'}</strong><span className="away"><ClubName team={names.get(match.awayId)} hasLocal={hasLocal}/></span></div><small>{played ? 'Resultado registrado' : 'A disputar'}</small></div>;
  })}</div> : <EmptyPanel icon="calendar" title="Ainda não há confrontos">Gere partidas para vê-las aqui.</EmptyPanel>;
}

function MiniStandings({ standings, teams, compact = false, hasLocal = false }: { standings: Standing[]; teams: Team[]; compact?: boolean; hasLocal?: boolean }) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  return standings.length ? <div className="showcase-table-wrap"><table className="showcase-table"><thead><tr><th scope="col">#</th><th scope="col">Equipe</th><th scope="col">PTS</th><th scope="col">J</th>{!compact && <><th scope="col">V</th><th scope="col">E</th><th scope="col">D</th><th scope="col">GP</th><th scope="col">GC</th><th scope="col">SG</th></>}</tr></thead><tbody>{standings.map((row, index) => <tr key={row.id}><td>{String(index + 1).padStart(2, '0')}</td><td><span className="table-team"><ClubName team={byId.get(row.id)} hasLocal={hasLocal}/></span></td><td className="points">{row.points}</td><td>{row.played}</td>{!compact && <><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td></>}</tr>)}</tbody></table></div> : <EmptyPanel icon="team" title="A tabela começa com as equipes">Cadastre participantes no laboratório para iniciar a classificação.</EmptyPanel>;
}

function DashboardPanel({ data, standings, hasLocal }: { data: DemoState; standings: Standing[]; hasLocal: boolean }) {
  const played = data.fixtures.filter((fixture) => fixture.homeScore !== null && fixture.awayScore !== null).length;
  const metrics: { icon: GlyphName; value: string; label: string; note: string }[] = [
    { icon: 'trophy', value: hasLocal ? (data.name ? '01' : '00') : '01', label: 'Campeonatos', note: hasLocal ? 'neste navegador' : 'exemplo' },
    { icon: 'team', value: String(data.teams.length).padStart(2, '0'), label: 'Equipes', note: 'cadastradas' },
    { icon: 'team', value: '—', label: 'Jogadores', note: 'módulo em preparação' },
    { icon: 'calendar', value: String(played).padStart(2, '0'), label: 'Partidas', note: 'com resultado' },
  ];
  return <><div className="showcase-metrics">{metrics.map((metric) => <div className="showcase-metric" key={metric.label}><span className="metric-glyph"><Glyph name={metric.icon} size={20}/></span><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.note}</small></div>)}</div><div className="showcase-columns"><div className="showcase-subpanel"><div className="showcase-subhead"><h3>Partidas</h3><LabLink tab="matches">Ver todas ↗</LabLink></div><MiniMatches data={data} limit={2} hasLocal={hasLocal}/></div><div className="showcase-subpanel"><div className="showcase-subhead"><h3>Classificação</h3><LabLink tab="standings">Ver tabela ↗</LabLink></div><MiniStandings standings={standings.slice(0, 4)} teams={data.teams} compact hasLocal={hasLocal}/></div></div></>;
}

function ChampionshipsPanel({ data, hasLocal }: { data: DemoState; hasLocal: boolean }) {
  if (hasLocal && !data.name) return <EmptyPanel icon="trophy" title="Nomeie sua competição">Salve as informações básicas para ver o campeonato nesta área.</EmptyPanel>;
  return <div className="competition-layout"><div className="showcase-competition"><div className="competition-emblem"><Glyph name="trophy" size={36}/></div><div className="competition-copy"><span className="showcase-chip">{hasLocal ? 'Demonstração local' : 'Exemplo fictício'}</span><h3>{data.name}</h3><p>{data.sport} · {data.format === 'double' ? 'Turno e returno' : 'Turno único'} · {data.teams.length} equipes</p><small>Status: {data.fixtures.length ? 'confrontos gerados' : 'aguardando confrontos'}</small></div><LabLink tab="portal" className="button button-outline">Ver detalhes ↗</LabLink></div><div className="showcase-roster"><div className="showcase-subhead"><h3>Equipes participantes</h3><LabLink tab="config">Gerenciar ↗</LabLink></div><div className="roster-items">{data.teams.length ? data.teams.slice(0, 8).map((team) => <span key={team.id}><ClubName team={team} hasLocal={hasLocal}/></span>) : <p>Cadastre equipes no laboratório.</p>}</div></div></div>;
}

function StatisticsPanel({ data, standings }: { data: DemoState; standings: Standing[] }) {
  const scored = data.fixtures.filter((fixture) => fixture.homeScore !== null && fixture.awayScore !== null);
  const totalGoals = scored.reduce((sum, fixture) => sum + Number(fixture.homeScore) + Number(fixture.awayScore), 0);
  return <div className="statistics-layout"><div className="statistics-focus"><span className="showcase-chip">Equipes</span><h3>Desempenho da competição</h3><div className="statistics-numbers"><div><strong>{scored.length}</strong><span>resultados</span></div><div><strong>{totalGoals}</strong><span>gols registrados</span></div><div><strong>{standings[0]?.name || '—'}</strong><span>líder atual</span></div></div><p>Estatísticas calculadas a partir dos placares da demonstração.</p></div><div className="statistics-upcoming"><span className="showcase-chip muted-chip">Em desenvolvimento</span><h3>Artilharia e jogadores em destaque</h3><p>O cadastro de atletas e as estatísticas individuais chegarão em uma próxima etapa.</p><LabLink tab="standings" className="inline-action">Explorar dados das equipes ↗</LabLink></div></div>;
}

function PowerSection() {
  const [source, setSource] = useState<'esports' | 'local'>('esports');
  const { data, standings, hasLocal, label } = usePresentation(source);
  const [active, setActive] = useState<TabKey>('dashboard');
  useEffect(() => {
    const open = (event: Event) => {
      const tab = (event as CustomEvent<TabKey>).detail;
      if (TABS.some((entry) => entry.key === tab)) setActive(tab);
    };
    window.addEventListener('tr:open-showcase-tab', open);
    return () => window.removeEventListener('tr:open-showcase-tab', open);
  }, []);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = TABS.findIndex((tab) => tab.key === active);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(TABS[next].key);
    tabRefs.current[next]?.focus();
  };
  return <><Heading eyebrow="A PLATAFORMA EM AÇÃO" title="Conheça o poder da" accent="TR Campeonatos." description="Tudo o que você precisa para organizar uma competição profissional em um só lugar."/><div className="showcase-shell"><div className="showcase-topline"><img src={OFFICIAL_SYMBOL} width="804" height="519" alt="" loading="lazy"/><span>EXPERIÊNCIA DO ORGANIZADOR</span><span className="showcase-live"><i/> {label}</span></div><div className="showcase-source-switch" role="group" aria-label="Cenário da apresentação"><button type="button" aria-pressed={source === 'esports'} onClick={() => setSource('esports')}>Copa TR E-SPORTS</button><button type="button" aria-pressed={source === 'local'} onClick={() => setSource('local')}>Minha demonstração</button><small>Resultados da copa são simulados; escudos originais fornecidos pelo usuário.</small></div><div className="showcase-tabs" role="tablist" aria-label="Apresentação do sistema">{TABS.map((tab, index) => <button key={tab.key} ref={(node) => { tabRefs.current[index] = node; }} id={`showcase-tab-${tab.key}`} type="button" role="tab" aria-selected={active === tab.key} aria-controls="showcase-panel" tabIndex={active === tab.key ? 0 : -1} onClick={() => setActive(tab.key)} onKeyDown={(event) => onTabKeyDown(event, index)} className={active === tab.key ? 'active' : ''}><Glyph name={tab.icon} size={17}/>{tab.label}</button>)}</div><div className="showcase-panel" id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${TABS[activeIndex].key}`} key={active}><div className="showcase-panel-head"><div><span className="showcase-chip">{label}</span><h3>{TABS[activeIndex].label}</h3></div><span className="panel-context">TR CAMPEONATOS / VISÃO GERAL</span></div>{active === 'dashboard' && <DashboardPanel data={data} standings={standings} hasLocal={hasLocal}/ >}{active === 'championships' && <ChampionshipsPanel data={data} hasLocal={hasLocal}/ >}{active === 'matches' && <MiniMatches data={data} limit={data.fixtures.length} hasLocal={hasLocal}/ >}{active === 'standings' && <MiniStandings standings={standings} teams={data.teams} hasLocal={hasLocal}/ >}{active === 'statistics' && <StatisticsPanel data={data} standings={standings}/ >}</div></div></>;
}

const FEATURES: { title: string; description: string; icon: GlyphName; status: 'Disponível na demonstração' | 'Parcial' | 'Em desenvolvimento' }[] = [
  { title: 'Criar campeonatos', description: 'Configure nome, modalidade e pontos corridos em poucos passos.', icon: 'trophy', status: 'Disponível na demonstração' },
  { title: 'Gerenciar equipes', description: 'Cadastre equipes, escudos e perfis. Elencos estão em preparação.', icon: 'team', status: 'Parcial' },
  { title: 'Gerar confrontos', description: 'Monte rodadas de turno único ou returno automaticamente.', icon: 'calendar', status: 'Disponível na demonstração' },
  { title: 'Controlar resultados', description: 'Registre placares e corrija resultados com histórico local.', icon: 'ball', status: 'Disponível na demonstração' },
  { title: 'Classificação automática', description: 'A tabela se atualiza a cada resultado lançado.', icon: 'chart', status: 'Disponível na demonstração' },
  { title: 'Estatísticas', description: 'Confira números das equipes. Dados de atletas virão depois.', icon: 'chart', status: 'Parcial' },
  { title: 'Inscrições digitais', description: 'Organização de inscrições e aprovações em preparação.', icon: 'team', status: 'Em desenvolvimento' },
  { title: 'Portal personalizado', description: 'Página pública para competições publicadas pelo organizador.', icon: 'portal', status: 'Parcial' },
];

function FeaturesSection() {
  return <><Heading eyebrow="CENTRAL DE OPERAÇÕES" title="Tudo para sua" accent="competição." description="Uma apresentação editorial da plataforma: o que acontece antes, durante e depois de cada rodada."/><div className="feature-editorial"><article className="feature-command"><div className="feature-command-bar"><span><i/> CENTRAL DE JOGO</span><small>SIMULAÇÃO VISUAL</small></div><div className="feature-command-main"><div className="command-match"><p>PRÓXIMA PARTIDA <b>• RODADA 03</b></p><div className="command-score"><div><span className="command-crest gold">TR</span><strong>Equipe mandante</strong></div><b>×</b><div><span className="command-crest silver">TR</span><strong>Equipe visitante</strong></div></div><small>Confronto demonstrativo · nenhum resultado oficial</small></div><div className="command-table"><header><span>CLASSIFICAÇÃO</span><small>PTS</small></header><p><b>01</b><span>Classificação automática</span><strong>—</strong></p><p><b>02</b><span>Rodadas e confrontos</span><strong>—</strong></p><p><b>03</b><span>Resultados registrados</span><strong>—</strong></p></div></div><footer><span><Glyph name="calendar" size={15}/> Calendário organizado</span><span><Glyph name="chart" size={15}/> Dados em evolução</span></footer></article><div className="feature-story"><article className="feature-story-lead"><span>DO PRIMEIRO APITO AO REGISTRO FINAL</span><h3>Uma central pensada para quem conduz a competição.</h3><p>Os módulos trabalham juntos, sem transformar a operação esportiva em uma coleção de telas desconectadas.</p><LabLink className="button button-primary">Experimentar a central <span aria-hidden="true">→</span></LabLink></article><div className="feature-signal-grid">{FEATURES.slice(0, 4).map((feature, index) => <article className="feature-signal" key={feature.title}><span className="feature-signal-icon"><Glyph name={feature.icon} size={20}/></span><div><small>0{index + 1}</small><h3>{feature.title}</h3><p>{feature.description}</p></div></article>)}</div></div><div className="feature-rail" aria-label="Módulos complementares">{FEATURES.slice(4).map((feature) => <article key={feature.title}><span><Glyph name={feature.icon} size={19}/></span><div><h3>{feature.title}</h3><p>{feature.description}</p></div><small className={feature.status === 'Em desenvolvimento' ? 'future' : feature.status === 'Parcial' ? 'partial' : ''}>{feature.status}</small></article>)}</div></div></>;
}

const SPORTS: { name: string; icon: GlyphName; description: string; detail: string; status: string; available: boolean; image?: string; alt?: string }[] = [
  { name: 'Futebol', icon: 'ball', description: 'Rodadas e classificação de pontos corridos.', detail: 'Demonstração funcional de jogos, placares e tabela com vitória valendo três pontos.', status: 'Demonstração disponível', available: true, image: '/assets/home/football.webp', alt: 'Bola de futebol em estádio noturno' },
  { name: 'Futsal', icon: 'ball', description: 'Organize equipes e confrontos em quadra.', detail: 'O laboratório usa o mesmo motor genérico de pontos corridos; regras específicas da modalidade virão depois.', status: 'Demonstração genérica', available: true, image: '/assets/home/futsal.webp', alt: 'Bola de futsal em quadra iluminada' },
  { name: 'Basquete', icon: 'basket', description: 'Uma estrutura para competições de quadra.', detail: 'Pontuação por modalidade, períodos e estatísticas próprias ainda não estão implementados.', status: 'Regras em desenvolvimento', available: false, image: '/assets/home/basketball.webp', alt: 'Bola de basquete em quadra profissional' },
  { name: 'Vôlei', icon: 'volley', description: 'Planeje torneios e temporadas.', detail: 'Sets, critérios específicos e classificação de vôlei ainda não estão implementados.', status: 'Regras em desenvolvimento', available: false, image: '/assets/home/volleyball.webp', alt: 'Bola de vôlei em arena iluminada' },
  { name: 'Handebol', icon: 'handball', description: 'Mais possibilidades para seus torneios.', detail: 'Cadastro e regras específicas de handebol serão adicionados em uma etapa futura.', status: 'Em desenvolvimento', available: false },
  { name: 'E-sports', icon: 'gamepad', description: 'Competições digitais em um só lugar.', detail: 'Formatos, mapas e regras por jogo ainda não estão implementados.', status: 'Em desenvolvimento', available: false, image: '/assets/home/esports.webp', alt: 'Controle para competições de e-sports' },
];

function SportsSection() {
  const [selected, setSelected] = useState(0);
  const sport = SPORTS[selected];
  return <><Heading eyebrow="MODALIDADES" title="Uma plataforma." accent="Infinitas competições." description="Cada modalidade recebe uma presença própria — sem prometer regras que ainda não fazem parte do produto."/><div className="sports-atlas"><article className="sport-spotlight" aria-live="polite">{sport.image ? <img src={sport.image} width="1536" height="1024" alt={sport.alt} loading="lazy"/> : <div className="sport-spotlight-signal" aria-hidden="true"><Glyph name={sport.icon} size={78}/></div>}<div className="sport-spotlight-overlay"><span className={`showcase-chip ${sport.available ? '' : 'muted-chip'}`}>{sport.status}</span><div><p>EM FOCO</p><h3>{sport.name}</h3><p>{sport.detail}</p></div>{sport.available ? <LabLink className="button button-primary">Explorar no laboratório <span aria-hidden="true">↗</span></LabLink> : <span className="sport-coming">Disponibilidade futura</span>}</div></article><div className="sport-atlas-selector" role="group" aria-label="Escolha uma modalidade">{SPORTS.map((item, index) => <button key={item.name} type="button" className={`sport-atlas-card ${selected === index ? 'selected' : ''} ${item.image ? 'has-image' : 'signal'}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.image && <img src={item.image} width="1536" height="1024" alt="" loading="lazy"/>}<span className="sport-atlas-tint"/><span className="sport-atlas-icon"><Glyph name={item.icon} size={23}/></span><span><strong>{item.name}</strong><small>{item.description}</small></span><i aria-hidden="true">↗</i></button>)}</div></div></>;
}

const STEPS = [
  { number: '01', title: 'Crie sua conta', detail: 'Contas estão em preparação. Hoje, teste sem cadastro.', status: 'Em breve' },
  { number: '02', title: 'Configure seu campeonato', detail: 'Defina nome, modalidade e formato no laboratório.', status: 'Disponível na demonstração' },
  { number: '03', title: 'Cadastre suas equipes', detail: 'Adicione e organize os participantes da competição.', status: 'Disponível na demonstração' },
  { number: '04', title: 'Gerencie sua competição', detail: 'Gere jogos, registre placares e acompanhe a tabela.', status: 'Disponível na demonstração' },
];

function StepsSection() {
  return <><Heading eyebrow="COMO FUNCIONA" title="Da ideia ao" accent="apito inicial." description="Quatro etapas simples para entender o caminho da sua competição."/><div className="premium-step-grid">{STEPS.map((step) => <div className="premium-step" key={step.number}><span className="step-count">{step.number}</span><span className="step-line" aria-hidden="true"/><h3>{step.title}</h3><p>{step.detail}</p><small>{step.status}</small></div>)}</div></>;
}

function FeaturedSection() {
  return <Heading eyebrow="COMPETIÇÕES" title="Campeonatos" accent="em destaque." description="Acompanhe as competições publicadas pelos organizadores, com jogos, resultados e classificação."/>;
}

const PLANS = [
  { name: 'Gratuito', tag: 'Demonstração disponível', description: 'Experimente o núcleo esportivo sem conta e sem cobrança.', items: ['Campeonato fictício local', 'Equipes e confrontos', 'Resultados e classificação'], current: true },
  { name: 'Profissional', tag: 'Em preparação', description: 'Estrutura planejada para organizadores de competições reais.', items: ['Contas de organizador', 'Publicação online', 'Gestão ampliada'], current: false },
  { name: 'Premium', tag: 'Em preparação', description: 'Recursos avançados serão definidos antes da abertura comercial.', items: ['Personalização', 'Colaboração', 'Relatórios avançados'], current: false },
];

function PlansSection() {
  return <><Heading eyebrow="PLANOS E ASSINATURAS" title="Uma solução para" accent="cada fase." description="Planos comerciais e valores definitivos ainda estão em preparação. Nenhuma cobrança está ativa."/><div className="premium-plans-grid">{PLANS.map((plan) => <article className={`premium-plan ${plan.current ? 'current' : ''}`} key={plan.name}><span className={`showcase-chip ${plan.current ? '' : 'muted-chip'}`}>{plan.tag}</span><h3>{plan.name}</h3><p>{plan.description}</p><ul>{plan.items.map((item) => <li key={item}>{item}</li>)}</ul>{plan.current ? <LabLink className="button button-primary">Experimentar gratuitamente →</LabLink> : <span className="plan-unavailable">Disponibilidade e valores a definir</span>}</article>)}</div></>;
}

const sections = [
  ['power-root', PowerSection],
  ['features-root', FeaturesSection],
  ['sports-root', SportsSection],
  ['steps-root', StepsSection],
  ['featured-root', FeaturedSection],
  ['plans-root', PlansSection],
] as const;

for (const [id, Component] of sections) {
  const element = document.getElementById(id);
  if (element) createRoot(element).render(<Component/>);
}
