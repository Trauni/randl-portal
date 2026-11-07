import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function Topbar({ user }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (localStorage.getItem('theme') === 'light')
      document.getElementById('root').classList.add('light');
  }, []);
  const displayName = user?.display_name || user?.fullName || user?.username || '?';
  const initials = displayName.split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');
  const groups = user?.groups || [];
  // Externer Link zu OpenProject, nur Geschäftsführung und Backoffice
  const tags = user?.accessTags || [];
  const showProjekte = tags.includes('geschaeftsfuehrung') || tags.includes('backoffice');
  const roleLabel = ['Geschäftsführung','Backoffice'].some(g => groups.includes(g)) ? 'Administrator'
    : groups.includes('it') ? 'IT'
    : groups.includes('Gashandel') ? 'Gashandel'
    : groups.includes('webeditor') ? 'Web Editor' : 'Mitarbeiter';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">Mitarbeiterportal</span>
      </div>
      <div className="topbar-right">
        <a href="https://cloud.randlweb.de" target="_blank" rel="noreferrer" className="topbar-quicklink-btn" title="Nextcloud">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M8 12a4 4 0 0 1 8 0"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/></svg>
          <span>Cloud</span>
        </a>
        <a href="https://docs.randlweb.de" target="_blank" rel="noreferrer" className="topbar-quicklink-btn" title="BookStack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span>Doku</span>
        </a>
        {showProjekte && (
          <a href="https://projects.randlweb.de" target="_blank" rel="noreferrer" className="topbar-quicklink-btn" title="OpenProject">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span>Projekte</span>
          </a>
        )}
        <button className="topbar-theme-btn" title="Light/Dark wechseln"
          onClick={() => {
            const root = document.getElementById('root');
            root.classList.toggle('light');
            localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          </svg>
        </button>
        <button className="topbar-avatar-btn" onClick={() => navigate('/profil')} title={`Mein Profil – ${displayName}`}>
          <div className="topbar-avatar">{initials || '?'}</div>
          <div className="topbar-user-info">
            <span className="topbar-user-name">{displayName}</span>
            <span className="topbar-user-role">{roleLabel}</span>
          </div>
          <svg className="topbar-avatar-chevron" width="12" height="12" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <style>{`
        .topbar{height:46px;background:var(--bg1);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 18px;flex-shrink:0;position:sticky;top:0;z-index:50;}
        .topbar-left{display:flex;align-items:center;}
        .topbar-title{font-size:13px;font-weight:600;color:var(--text2);}
        .topbar-right{display:flex;align-items:center;gap:8px;}
        .topbar-quicklink-btn{display:flex;align-items:center;gap:5px;padding:0 10px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);text-decoration:none;font-size:12px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;}.topbar-quicklink-btn:hover{background:var(--bg3);color:var(--text1);}.topbar-quicklink-btn svg{flex-shrink:0;}.topbar-theme-btn{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;}
        .topbar-theme-btn:hover{background:var(--bg3);color:var(--text1);}
        .topbar-avatar-btn{display:flex;align-items:center;gap:9px;padding:4px 10px 4px 4px;border-radius:8px;border:1px solid transparent;background:transparent;cursor:pointer;transition:background .15s,border-color .15s;}
        .topbar-avatar-btn:hover{background:var(--bg2);border-color:var(--border);}
        .topbar-avatar{width:30px;height:30px;border-radius:50%;background:var(--r);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .topbar-user-info{display:flex;flex-direction:column;gap:1px;align-items:flex-start;}
        .topbar-user-name{font-size:13px;font-weight:600;color:var(--text1);white-space:nowrap;line-height:1;}
        .topbar-user-role{font-size:11px;color:var(--text3);white-space:nowrap;line-height:1;}
        .topbar-avatar-chevron{color:var(--text3);}
      `}</style>
    </header>
  );
}
