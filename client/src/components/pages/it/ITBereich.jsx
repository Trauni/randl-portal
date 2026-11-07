import { NavLink, Navigate, useParams } from 'react-router-dom';
import SystemDashboard from './SystemDashboard';
import CloudflareDNS from './CloudflareDNS';
import SpamDashboard from './SpamDashboard';
import Docker from './Docker';
import Logs from './Logs';
import Cleanup from './Cleanup';
import Wartung from './Wartung';

// Alle IT-Dashboards auf einer Seite. Die bisherigen URLs (/it/system, /it/docker …)
// bleiben gültig und wählen den Tab; gerendert wird nur der aktive Tab.
export const IT_TABS = [
  { key: 'system',      label: 'System',     Seite: SystemDashboard },
  { key: 'docker',      label: 'Docker',     Seite: Docker },
  { key: 'logs',        label: 'Logs',       Seite: Logs },
  { key: 'cloudflare',  label: 'Cloudflare', Seite: CloudflareDNS },
  { key: 'spam',        label: 'Spam',       Seite: SpamDashboard },
  { key: 'cleanup',     label: 'Cleanup',    Seite: Cleanup },
  { key: 'maintenance', label: 'Wartung',    Seite: Wartung },
];

export default function ITBereich() {
  const { tab } = useParams();
  const aktiv = IT_TABS.find(t => t.key === tab);
  if (!aktiv) return <Navigate to="/it/system" replace />;
  const { Seite } = aktiv;

  return (
    <div>
      <nav className="it-tabs" aria-label="IT-Bereiche">
        {IT_TABS.map(t => (
          <NavLink key={t.key} to={`/it/${t.key}`}
            className={({ isActive }) => `it-tab${isActive ? ' it-tab--aktiv' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Seite key={aktiv.key} />
      <style>{`
        .it-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto;scrollbar-width:none;}
        .it-tabs::-webkit-scrollbar{display:none;}
        .it-tab{padding:8px 14px;font-size:13px;font-weight:500;color:var(--text2);text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:color .12s,border-color .12s;}
        .it-tab:hover{color:var(--text1);}
        .it-tab--aktiv{color:var(--text1);border-bottom-color:var(--r);}
      `}</style>
    </div>
  );
}
