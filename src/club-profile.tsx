import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateStandings } from '../dist/engine.mjs';
import { clubJourney, safeCrestUrl } from '../dist/club.mjs';
import { ClubProfileView } from './club-experience';

type Club = { id: string; name: string; crest?: string | null; demoAsset?: string; shortName?: string; category?: string; notes?: string; color?: string };
type Match = { id: string; round: number; homeId: string; awayId: string; homeScore: number | null; awayScore: number | null };
type JourneyItem = { id: string; round: number; home: boolean; opponentId: string; opponent: string; played: boolean; goalsFor: number | null; goalsAgainst: number | null; outcome: string };
type Demo = { name: string; season?: string; sport: string; format: string; teams: Club[]; fixtures: Match[] };

function readDemo(): Demo {
  try {
    const data = JSON.parse(localStorage.getItem('tr-campeonatos-demo-v1') || 'null');
    if (data && Array.isArray(data.teams) && Array.isArray(data.fixtures)) return data;
  } catch { /* The profile shows a clear empty state below. */ }
  return { name: '', sport: 'Futebol', format: 'single', teams: [], fixtures: [] };
}

function ClubCrest({ team, className = '' }: { team?: Club; className?: string }) {
  const fallback = '/assets/official/06_escudo_padrao_tr_campeonatos.webp';
  const src = safeCrestUrl(team?.crest) || team?.demoAsset || fallback;
  return <img className={`profile-crest ${className}`} src={src} alt={`Escudo de ${team?.name || 'equipe'}`} onError={(event) => { if (event.currentTarget.src !== new URL(fallback, location.href).href) event.currentTarget.src = fallback; }}/>;
}

function Profile() {
  const [hash, setHash] = useState(window.location.hash);
  const [demo, setDemo] = useState(readDemo);
  useEffect(() => {
    const refresh = () => { setHash(window.location.hash); setDemo(readDemo()); };
    window.addEventListener('hashchange', refresh);
    window.addEventListener('tr:demo-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('hashchange', refresh); window.removeEventListener('tr:demo-updated', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const active = hash.startsWith('#clube-');
  useEffect(() => {
    const lab = document.getElementById('lab-app');
    const profile = document.getElementById('club-profile-root');
    if (lab) lab.hidden = active;
    if (profile) profile.hidden = !active;
    if (active) profile?.scrollIntoView({ block: 'start' });
  }, [active, hash]);
  if (!active) return null;
  let id = '';
  try { id = decodeURIComponent(hash.slice(7)); } catch { /* Invalid route shows the missing profile state. */ }
  return <ClubProfileView id={id} localData={demo}/>;
}

const root = document.getElementById('club-profile-root');
if (root) createRoot(root).render(<Profile/>);
