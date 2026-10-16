import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { roleFromGroups, tagsFromGroups, hasArea } from '../../utils/permissions';

const Icon = ({ d, size=15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);

const ICONS = {
  dashboard:  'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  vacation:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 1-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  profile:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  clock:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  documents:  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  system:     'M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z',
  cloudflare: 'M22 16.74A11 11 0 0 1 2.57 11M2 7.26A11 11 0 0 1 21.43 13',
  spam:       'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  docker:     'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  logs:       'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  orders:     'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  products:   'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  cms:        'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
  shop:       'M2 7l2-4h16l2 4M2 7h20M4 7v13h16V7M9 20v-6h6v6',
  images:     'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM21 15l-5-5L5 21',
  bell:       'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  calendar:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  employees:  'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  logout:     'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  metall:     'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  collapse:   'M11 19l-7-7 7-7M19 19l-7-7 7-7',
  expand:     'M13 5l7 7-7 7M5 5l7 7-7 7',
};

function NavItem({ to, icon, label, collapsed }) {
  return (
    <NavLink to={to} className={({isActive})=>`nav-item${isActive?' nav-item--active':''}${collapsed?' nav-item--collapsed':''}`} title={collapsed ? label : undefined}>
      <span className="nav-icon"><Icon d={ICONS[icon]||ICONS.dashboard}/></span>
      {!collapsed && <span className="nav-label">{label}</span>}
    </NavLink>
  );
}

// Platzhalter fuer geplante, noch nicht gebaute Bereiche - nicht klickbar.
function NavItemSoon({ icon, label, collapsed }) {
  return (
    <div className={`nav-item nav-item--soon${collapsed?' nav-item--collapsed':''}`} title={collapsed ? `${label} (in Planung)` : 'In Planung'}>
      <span className="nav-icon"><Icon d={ICONS[icon]||ICONS.dashboard}/></span>
      {!collapsed && <><span className="nav-label">{label}</span><span className="nav-badge">bald</span></>}
    </div>
  );
}

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed(v => {
    const next = !v;
    try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0'); } catch {}
    return next;
  });

  // Sichtbarkeit ueber das zentrale Berechtigungsmodell (utils/permissions.js).
  // Der Fallback auf die Gruppen greift nur fuer Alt-Sessions ohne role/accessTags.
  const groups = user?.groups || [];
  const role   = user?.role || roleFromGroups(groups);
  const tags   = user?.accessTags || tagsFromGroups(groups);
  const can    = (area) => hasArea(role, tags, area);

  const showGashandel = can('gashandel');
  const showZeltverleih = can('zeltplanung');
  const showLieferantenauftrag = can('metallarbeiten.lieferantenauftrag');
  const showMetallVorgaenge = can('metallarbeiten.vorgaenge');
  const showMetallarbeiten = showLieferantenauftrag || showMetallVorgaenge;
  const showHR        = can('hr.urlaubskalender') || can('hr.zeitauswertung') || can('hr.mitarbeiter');
  const showIT        = can('it');
  const showContent   = can('content');

  const displayName = user?.display_name || user?.fullName || user?.username || '';
  const initials    = displayName.split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');
  const roleLabel   = tags.includes('geschaeftsfuehrung') ? 'Geschäftsführung'
                    : tags.includes('backoffice')         ? 'Backoffice'
                    : tags.includes('gashandel')          ? 'Gashandel'
                    : tags.includes('metallarbeiten')     ? 'Metallarbeiten'
                    : tags.includes('zeltverleih')        ? 'Zeltverleih'
                    : role === 'freelancer'               ? 'Freelancer'
                    : role === 'extern'                   ? 'Extern'
                    : 'Mitarbeiter';

  const w = collapsed ? 52 : 218;

  return (
    <aside className={`sidebar${collapsed?' sidebar--collapsed':''}`} style={{ width: w }}>
      {/* Logo */}
      <div className="sidebar-logo" onClick={()=>navigate('/dashboard')} role="button" tabIndex={0}>
        <img src="/logo.png" alt="Randl" className="sidebar-logo-img"/>
        {!collapsed && <span className="sidebar-logo-text">Randl Portal</span>}
      </div>

      {/* Toggle-Button */}
      <button className="sidebar-toggle" onClick={toggle} title={collapsed ? 'Sidebar aufklappen' : 'Sidebar zuklappen'}>
        <Icon d={collapsed ? ICONS.expand : ICONS.collapse} size={13}/>
      </button>

      {/* Nav */}
      <nav className="sidebar-nav">
        <NavItem to="/dashboard" icon="dashboard" label="Dashboard" collapsed={collapsed}/>

        {!collapsed && <div className="nav-section-label">Persönlich</div>}
        {collapsed && <div className="nav-section-divider"/>}
        <NavItem to="/profil" icon="profile"  label="Profil & Daten" collapsed={collapsed}/>
        <NavItem to="/urlaub" icon="vacation" label="Mein Urlaub"    collapsed={collapsed}/>
        <NavItem to="/zeit"   icon="clock"    label="Meine Zeiterfassung" collapsed={collapsed}/>

        {showGashandel&&<>
          {!collapsed && <div className="nav-section-label">Gashandel</div>}
          {collapsed && <div className="nav-section-divider"/>}
          <NavItem to="/finance/kunden"       icon="employees" label="Kunden" collapsed={collapsed}/>
          <NavItem to="/finance/bestellungen" icon="orders"    label="Bestellungen"              collapsed={collapsed}/>
          <NavItem to="/finance/rhythmus"  icon="calendar"  label="Lieferrhythmus"             collapsed={collapsed}/>
          <NavItem to="/finance/mitteilungen" icon="bell"  label="Mitteilungen"               collapsed={collapsed}/>
          <NavItem to="/finance/info-mail"    icon="documents" label="Info-Mail Rollout"     collapsed={collapsed}/>
          <NavItem to="/finance/produkte"     icon="products"  label="Produkte"                  collapsed={collapsed}/>
          <NavItem to="/finance/widmann-bestand" icon="products" label="Widmann-Bestand" collapsed={collapsed}/>
        </>}

        {showZeltverleih&&<>
          {!collapsed && <div className="nav-section-label">Zeltverleih</div>}
          {collapsed && <div className="nav-section-divider"/>}
          <NavItem to="/zeltverleih/zeltplaner" icon="calendar" label="Zeltplaner" collapsed={collapsed}/>
        </>}

        {showMetallarbeiten&&<>
          {!collapsed && <div className="nav-section-label">Metallarbeiten</div>}
          {collapsed && <div className="nav-section-divider"/>}
          {showMetallVorgaenge && <NavItem to="/metallarbeiten/vorgaenge" icon="orders" label="Vorgänge" collapsed={collapsed}/>}
          {showLieferantenauftrag && <NavItem to="/metallarbeiten/lieferantenauftraege" icon="metall" label="Lieferantenaufträge" collapsed={collapsed}/>}
        </>}

        {showHR&&<>
          {!collapsed && <div className="nav-section-label">HR Department</div>}
          {collapsed && <div className="nav-section-divider"/>}
          {can('hr.urlaubskalender') && <NavItem to="/hr/urlaubskalender" icon="calendar"  label="Urlaubskalender"      collapsed={collapsed}/>}
          {can('hr.zeitauswertung')  && <NavItem to="/hr/zeiterfassung"   icon="clock"     label="Zeiterfassung (Auswertung)" collapsed={collapsed}/>}
          {can('hr.mitarbeiter')     && <NavItem to="/hr/mitarbeiter"     icon="employees" label="Mitarbeiterverwaltung" collapsed={collapsed}/>}
        </>}

        {showIT&&<>
          {!collapsed && <div className="nav-section-label">IT Department</div>}
          {collapsed && <div className="nav-section-divider"/>}
          <NavItem to="/it/system"      icon="system"     label="System Dashboard" collapsed={collapsed}/>
          <NavItem to="/it/cloudflare"  icon="cloudflare" label="Cloudflare DNS"   collapsed={collapsed}/>
          <NavItem to="/it/spam"        icon="spam"       label="Spam Dashboard"   collapsed={collapsed}/>
          <NavItem to="/it/docker"      icon="docker"     label="Docker Dashboard" collapsed={collapsed}/>
          <NavItem to="/it/logs"        icon="logs"       label="System Logs"      collapsed={collapsed}/>
          <NavItem to="/it/cleanup"     icon="system"     label="Server Cleanup"   collapsed={collapsed}/>
          <NavItem to="/it/maintenance" icon="system"     label="Wartung"          collapsed={collapsed}/>
        </>}

        {showContent&&<>
          {!collapsed && <div className="nav-section-label">Content</div>}
          {collapsed && <div className="nav-section-divider"/>}
          <NavItem to="/content/cms"    icon="cms"    label="CMS Landingpage"  collapsed={collapsed}/>
          <NavItem to="/content/shop"   icon="shop"   label="CMS Shopseite"    collapsed={collapsed}/>
          <NavItem to="/content/bilder" icon="images" label="Bilderverwaltung" collapsed={collapsed}/>
        </>}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-avatar" title={collapsed ? displayName : undefined}>{initials}</div>
        {!collapsed && (
          <div className="sidebar-footer-info" onClick={()=>navigate('/profil')} role="button" tabIndex={0}>
            <span className="sidebar-footer-name">{displayName}</span>
            <span className="sidebar-footer-role">{roleLabel}</span>
            <span className="sidebar-footer-version">v{__APP_VERSION__} · {__APP_COMMIT__}</span>
          </div>
        )}
        <a href="/auth/logout" className="sidebar-logout-btn" title="Abmelden">
          <Icon d={ICONS.logout} size={14}/>
        </a>
      </div>

      <style>{`
        .sidebar{flex-shrink:0;background:var(--bg1);border-right:1px solid var(--border);display:flex;flex-direction:column;height:100vh;position:sticky;top:0;overflow:hidden;transition:width .2s ease;}
        .sidebar-logo{height:54px;display:flex;align-items:center;gap:10px;padding:0 13px;border-bottom:1px solid var(--border);cursor:pointer;flex-shrink:0;overflow:hidden;}
        .sidebar-logo-img{height:26px;width:auto;object-fit:contain;flex-shrink:0;}
        .sidebar-logo-text{font-size:14px;font-weight:700;color:var(--text2);white-space:nowrap;}
        .sidebar-toggle{position:absolute;top:16px;right:8px;width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:var(--bg2);color:var(--text3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;z-index:10;padding:0;}
        .sidebar-toggle:hover{background:var(--bg3);color:var(--text1);}
        .sidebar--collapsed .sidebar-toggle{right:6px;}
        .sidebar-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0;scrollbar-width:thin;scrollbar-color:var(--bg3) transparent;}
        .nav-item{display:flex;align-items:center;gap:9px;padding:6px 14px;margin:1px 6px;border-radius:7px;color:var(--text2);text-decoration:none;font-size:13px;font-weight:500;transition:background .12s,color .12s;white-space:nowrap;}
        .nav-item--collapsed{padding:6px 0;margin:1px 4px;justify-content:center;}
        .nav-item:hover{background:var(--bg2);color:var(--text1);}
        .nav-item--active{background:var(--bg2);color:var(--text1);}
        .nav-item--active .nav-icon svg{stroke:var(--r);}
        .nav-item--soon{color:var(--text3);cursor:default;opacity:.55;}
        .nav-item--soon:hover{background:transparent;color:var(--text3);}
        .nav-badge{font-size:9px;font-weight:600;background:var(--bg3);color:var(--text3);padding:1px 5px;border-radius:8px;flex-shrink:0;}
        .nav-icon{width:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .nav-label{flex:1;overflow:hidden;text-overflow:ellipsis;}
        .nav-section-label{padding:14px 16px 4px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);display:flex;align-items:center;justify-content:space-between;gap:6px;}
        .nav-section-tag{font-size:9.5px;font-weight:500;background:var(--bg3);color:var(--text3);padding:1px 6px;border-radius:10px;text-transform:none;letter-spacing:0;white-space:nowrap;flex-shrink:0;}
        .nav-section-divider{height:1px;background:var(--border);margin:6px 8px;}
        .sidebar-footer{flex-shrink:0;border-top:1px solid var(--border);padding:10px 8px;display:flex;align-items:center;gap:9px;overflow:hidden;}
        .sidebar-footer-avatar{width:30px;height:30px;border-radius:50%;background:var(--r);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:default;}
        .sidebar-footer-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;cursor:pointer;}
        .sidebar-footer-name{font-size:12.5px;font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sidebar-footer-role{font-size:11px;color:var(--text3);}
        .sidebar-footer-version{font-size:10px;color:var(--text3);opacity:.7;white-space:nowrap;}
        .sidebar-logout-btn{width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--text3);display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:background .15s,color .15s,border-color .15s;flex-shrink:0;}
        .sidebar-logout-btn:hover{background:var(--bg2);color:var(--red2);border-color:var(--red2);}
      `}</style>
    </aside>
  );
}
