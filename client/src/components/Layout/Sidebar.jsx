import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { hasArea } from '../../utils/permissions';

const Icon = ({ d, size=15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);

const ICONS = {
  dashboard:  'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  inbox:      'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
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

// count: optionale Zahl (z. B. offene Belege), wird nur ab 1 angezeigt
function NavItem({ to, icon, label, collapsed, count }) {
  return (
    <NavLink to={to} className={({isActive})=>`nav-item${isActive?' nav-item--active':''}${collapsed?' nav-item--collapsed':''}`} title={collapsed ? (count ? `${label} (${count})` : label) : undefined}>
      <span className="nav-icon"><Icon d={ICONS[icon]||ICONS.dashboard}/></span>
      {!collapsed && <span className="nav-label">{label}</span>}
      {!collapsed && count > 0 && <span className="nav-count">{count}</span>}
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

// Klappbarer Bereich ab „Persönlich“. Zugeklappt zeigt der Kopf die Summe der Zähler.
// In der schmalen Sidebar gibt es keine Köpfe; dort bleiben alle Einträge sichtbar.
function NavSection({ id, label, offen, onToggle, collapsed, count, children }) {
  if (collapsed) return <><div className="nav-section-divider"/>{children}</>;
  return (
    <div className="nav-section">
      <button type="button" className="nav-section-label nav-section-toggle" onClick={() => onToggle(id)} aria-expanded={offen}>
        <span>{label}</span>
        <span className="nav-section-meta">
          {!offen && count > 0 && <span className="nav-count">{count}</span>}
          <svg className={`nav-chevron${offen ? ' nav-chevron--offen' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </button>
      <div className={`nav-section-body${offen ? ' nav-section-body--offen' : ''}`}>
        <div className="nav-section-inner">{children}</div>
      </div>
    </div>
  );
}

// Standard: nur „Persönlich“ offen. Gespeichert wird nur, was der Nutzer selbst umschaltet.
const SECTION_DEFAULT = { persoenlich: true };
const SECTION_KEY = 'sidebar-sections';
// Welcher Bereich zu einer URL gehört — damit der Bereich der aktiven Seite aufgeht.
const SECTION_PFADE = [
  ['artikel', '/gashandel/artikel'],
  ['gashandel', '/finance/'], ['gashandel', '/gashandel/'],
  ['zeltverleih', '/zeltverleih/'],
  ['maschinenbau', '/metallarbeiten/'],
  ['hr', '/hr/'],
  ['it', '/it/'],
  ['content', '/content/'],
  ['persoenlich', '/profil'], ['persoenlich', '/urlaub'], ['persoenlich', '/zeit'],
];

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

  const [sections, setSections] = useState(() => {
    try { return { ...SECTION_DEFAULT, ...JSON.parse(localStorage.getItem(SECTION_KEY) || '{}') }; }
    catch { return { ...SECTION_DEFAULT }; }
  });
  const toggleSection = (id) => setSections(prev => {
    const next = { ...prev, [id]: !prev[id] };
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SECTION_KEY) || '{}');
      localStorage.setItem(SECTION_KEY, JSON.stringify({ ...gespeichert, [id]: next[id] }));
    } catch {}
    return next;
  });

  // Sichtbarkeit ueber das zentrale Berechtigungsmodell (utils/permissions.js).
  const role   = user?.role;
  const tags   = user?.accessTags || [];
  const can    = (area) => hasArea(role, tags, area);

  const showGashandel = can('gashandel');
  const showArtikel = can('artikel.lesen');
  const showGasAuswertung = can('gashandel.auswertung');
  const showLadebasen = can('fahrer.geraete');
  const showZeltplaner = can('zeltplanung');
  const showZeltprojekte = can('zeltverleih.projekte');
  const showZeltverleih = showZeltplaner || showZeltprojekte;
  const showMetallVorgaenge = can('metallarbeiten.vorgaenge');
  const showMetallkunden = can('metallarbeiten.kunden');
  const showMetallarbeiten = showMetallVorgaenge || showMetallkunden;

  // Zaehler fuer „Eingang“ (#371) und „Belege zuordnen“ (#370): beim Seitenwechsel, nach einer
  // Aktion auf der Seite (Event) und alle 5 Minuten
  const location = useLocation();
  // Liegt die aktive Seite in einem zugeklappten Bereich, geht dieser auf (nicht gespeichert).
  const aktiveSection = (SECTION_PFADE.find(([, p]) => location.pathname.startsWith(p)) || [])[0];
  useEffect(() => {
    if (aktiveSection) setSections(prev => (prev[aktiveSection] ? prev : { ...prev, [aktiveSection]: true }));
  }, [aktiveSection]);
  const [offeneBelege, setOffeneBelege] = useState(0);
  const [neuImEingang, setNeuImEingang] = useState(0);
  useEffect(() => {
    if (!showMetallVorgaenge) return undefined;
    const lade = () => {
      fetch('/api/metallarbeiten/zuordnen/anzahl')
        .then(r => (r.ok ? r.json() : { offen: 0 })).then(d => setOffeneBelege(d.offen || 0)).catch(() => {});
      fetch('/api/metallarbeiten/eingang/anzahl')
        .then(r => (r.ok ? r.json() : { neu: 0 })).then(d => setNeuImEingang(d.neu || 0)).catch(() => {});
    };
    lade();
    window.addEventListener('metall-zuordnen-geaendert', lade);
    window.addEventListener('metall-eingang-geaendert', lade);
    const takt = setInterval(lade, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('metall-zuordnen-geaendert', lade);
      window.removeEventListener('metall-eingang-geaendert', lade);
      clearInterval(takt);
    };
  }, [showMetallVorgaenge, location.pathname]);
  const showHR        = can('hr.urlaubskalender') || can('hr.zeitauswertung') || can('hr.mitarbeiter');
  const showIT        = can('it');
  const showContent   = can('content');

  const displayName = user?.display_name || user?.fullName || user?.username || '';
  const initials    = displayName.split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');
  const roleLabel   = tags.includes('geschaeftsfuehrung') ? 'Geschäftsführung'
                    : tags.includes('backoffice')         ? 'Backoffice'
                    : tags.includes('gashandel')          ? 'Gashandel'
                    : tags.includes('metallarbeiten')     ? 'Maschinenbau'
                    : tags.includes('zeltverleih')        ? 'Zeltverleih'
                    : role === 'freelancer'               ? 'Freelancer'
                    : role === 'extern'                   ? 'Extern'
                    : 'Mitarbeiter';

  const w = collapsed ? 52 : 240;

  return (
    <aside className={`sidebar${collapsed?' sidebar--collapsed':''}`} style={{ width: w }}>
      {/* Logo */}
      <div className="sidebar-logo" onClick={()=>navigate('/dashboard')} role="button" tabIndex={0}>
        {collapsed
          ? <img src="/logo.png" alt="Randl" className="sidebar-logo-img"/>
          : <><b className="sidebar-wordmark">RANDL</b><span className="sidebar-logo-text">Portal</span></>}
      </div>

      {/* Toggle-Button */}
      <button className="sidebar-toggle" onClick={toggle} title={collapsed ? 'Sidebar aufklappen' : 'Sidebar zuklappen'}>
        <Icon d={collapsed ? ICONS.expand : ICONS.collapse} size={13}/>
      </button>

      {/* Nav */}
      <nav className="sidebar-nav">
        <NavItem to="/dashboard" icon="dashboard" label="Dashboard" collapsed={collapsed}/>

        <NavSection id="persoenlich" label="Persönlich" offen={!!sections.persoenlich} onToggle={toggleSection} collapsed={collapsed}>
          <NavItem to="/profil" icon="profile"  label="Profil & Daten" collapsed={collapsed}/>
          <NavItem to="/urlaub" icon="vacation" label="Mein Urlaub"    collapsed={collapsed}/>
          <NavItem to="/zeit"   icon="clock"    label="Meine Zeiterfassung" collapsed={collapsed}/>
        </NavSection>

        {showArtikel && (
          <NavSection id="artikel" label="Artikel" offen={!!sections.artikel} onToggle={toggleSection} collapsed={collapsed}>
            <NavItem to="/gashandel/artikel/liste" icon="products" label="Artikelstamm" collapsed={collapsed}/>
          </NavSection>
        )}

        {showGashandel && (
          <NavSection id="gashandel" label="Gashandel" offen={!!sections.gashandel} onToggle={toggleSection} collapsed={collapsed}>
            <NavItem to="/finance/kunden"       icon="employees" label="Kunden"            collapsed={collapsed}/>
            <NavItem to="/finance/bestellungen" icon="orders"    label="Bestellungen"      collapsed={collapsed}/>
            <NavItem to="/finance/rhythmus"     icon="calendar"  label="Lieferrhythmus"    collapsed={collapsed}/>
            <NavItem to="/finance/mitteilungen" icon="bell"      label="Mitteilungen"      collapsed={collapsed}/>
            <NavItem to="/finance/info-mail"    icon="documents" label="Info-Mail Rollout" collapsed={collapsed}/>
            {showLadebasen && <NavItem to="/gashandel/disposition" icon="documents" label="Disposition" collapsed={collapsed}/>}
            {showLadebasen && <NavItem to="/gashandel/belege" icon="documents" label="Belege" collapsed={collapsed}/>}
            <NavItem to="/finance/widmann-bestand" icon="products" label="Bestände" collapsed={collapsed}/>
            {showGasAuswertung && <NavItem to="/gashandel/auswertung" icon="documents" label="Auswertung" collapsed={collapsed}/>}
            {showLadebasen && <NavItem to="/gashandel/einstellungen" icon="products" label="Einstellungen" collapsed={collapsed}/>}
          </NavSection>
        )}

        {showZeltverleih && (
          <NavSection id="zeltverleih" label="Zeltverleih" offen={!!sections.zeltverleih} onToggle={toggleSection} collapsed={collapsed}>
            {showZeltprojekte && <NavItem to="/zeltverleih/projekte" icon="orders" label="Zeltprojekte" collapsed={collapsed}/>}
            {showZeltplaner && <NavItem to="/zeltverleih/zeltplaner" icon="calendar" label="Zeltplaner" collapsed={collapsed}/>}
          </NavSection>
        )}

        {showMetallarbeiten && (
          <NavSection id="maschinenbau" label="Maschinenbau" offen={!!sections.maschinenbau} onToggle={toggleSection} collapsed={collapsed}
            count={showMetallVorgaenge ? neuImEingang + offeneBelege : 0}>
            {showMetallVorgaenge && <NavItem to="/metallarbeiten/eingang" icon="inbox" label="Eingang" count={neuImEingang} collapsed={collapsed}/>}
            {showMetallVorgaenge && <NavItem to="/metallarbeiten/vorgaenge" icon="orders" label="Alle Aufträge" collapsed={collapsed}/>}
            {showMetallVorgaenge && <NavItem to="/metallarbeiten/zuordnen" icon="documents" label="Belege zuordnen" count={offeneBelege} collapsed={collapsed}/>}
            {showMetallkunden && <NavItem to="/metallarbeiten/kunden" icon="employees" label="MB-Kunden" collapsed={collapsed}/>}
          </NavSection>
        )}

        {showHR && (
          <NavSection id="hr" label="HR Department" offen={!!sections.hr} onToggle={toggleSection} collapsed={collapsed}>
            {can('hr.urlaubskalender') && <NavItem to="/hr/urlaubskalender" icon="calendar"  label="Urlaubskalender"      collapsed={collapsed}/>}
            {can('hr.zeitauswertung')  && <NavItem to="/hr/zeiterfassung"   icon="clock"     label="Zeiterfassung (Auswertung)" collapsed={collapsed}/>}
            {can('hr.mitarbeiter')     && <NavItem to="/hr/mitarbeiter"     icon="employees" label="Mitarbeiterverwaltung" collapsed={collapsed}/>}
          </NavSection>
        )}

        {showIT && (
          <NavSection id="it" label="IT Department" offen={!!sections.it} onToggle={toggleSection} collapsed={collapsed}>
            {/* Alle IT-Dashboards liegen auf einer Seite mit Tabs (ITBereich.jsx) */}
            <NavLink to="/it/system" className={() => `nav-item${location.pathname.startsWith('/it/') ? ' nav-item--active' : ''}${collapsed ? ' nav-item--collapsed' : ''}`} title={collapsed ? 'IT-Dashboards' : undefined}>
              <span className="nav-icon"><Icon d={ICONS.system}/></span>
              {!collapsed && <span className="nav-label">IT-Dashboards</span>}
            </NavLink>
          </NavSection>
        )}

        {showContent && (
          <NavSection id="content" label="Content" offen={!!sections.content} onToggle={toggleSection} collapsed={collapsed}>
            <NavItem to="/content/cms"    icon="cms"    label="CMS Landingpage"  collapsed={collapsed}/>
            <NavItem to="/content/shop"   icon="shop"   label="CMS Shopseite"    collapsed={collapsed}/>
            <NavItem to="/content/bilder" icon="images" label="Bilderverwaltung" collapsed={collapsed}/>
            <NavItem to="/content/hinweis" icon="bell" label="Hinweisbalken Website" collapsed={collapsed}/>
            <NavItem to="/content/aktuelles" icon="documents" label="Aktuelles Website" collapsed={collapsed}/>
          </NavSection>
        )}
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
        .sidebar-logo{height:60px;display:flex;align-items:baseline;gap:8px;padding:0 20px;border-bottom:1px solid var(--border);cursor:pointer;flex-shrink:0;overflow:hidden;}
        .sidebar-logo-img{height:26px;width:auto;object-fit:contain;flex-shrink:0;}
        .sidebar-wordmark{font-family:var(--font-display);font-weight:400;font-size:30px;letter-spacing:.03em;color:var(--r);line-height:1;align-self:center;}
        .sidebar-logo-text{font-family:var(--font-head);font-weight:600;font-size:16px;color:var(--text2);white-space:nowrap;align-self:center;}
        .sidebar--collapsed .sidebar-logo{align-items:center;padding:0 13px;}
        .sidebar-toggle{position:absolute;top:16px;right:8px;width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:var(--bg2);color:var(--text3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;z-index:10;padding:0;}
        .sidebar-toggle:hover{background:var(--bg3);color:var(--text1);}
        .sidebar--collapsed .sidebar-toggle{right:6px;}
        .sidebar-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0;scrollbar-width:thin;scrollbar-color:var(--bg3) transparent;}
        .nav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;margin:1px 10px;border-radius:8px;color:var(--text1);text-decoration:none;font-size:15px;font-weight:500;transition:background .12s,color .12s;white-space:nowrap;}
        .nav-item--collapsed{padding:8px 0;margin:1px 4px;justify-content:center;}
        .nav-item:hover{background:var(--bg2);color:var(--text1);}
        .nav-item--active{background:var(--nav-active-bg);color:var(--nav-active-fg);font-weight:700;}
        .nav-item--active:hover{background:var(--nav-active-bg);color:var(--nav-active-fg);}
        .nav-item--active .nav-icon svg{stroke:currentColor;}
        .nav-item--soon{color:var(--text3);cursor:default;opacity:.55;}
        .nav-item--soon:hover{background:transparent;color:var(--text3);}
        .nav-badge{font-size:9px;font-weight:600;background:var(--bg3);color:var(--text3);padding:1px 5px;border-radius:8px;flex-shrink:0;}
        .nav-icon{width:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .nav-label{flex:1;overflow:hidden;text-overflow:ellipsis;}
        .nav-count{font-size:11px;font-weight:700;background:var(--r);color:#fff;min-width:18px;padding:1px 6px;border-radius:9px;text-align:center;flex-shrink:0;box-sizing:border-box;}
        .nav-section-label{padding:16px 20px 6px;font-family:var(--font-head);font-size:17px;font-weight:700;color:var(--text1);display:flex;align-items:center;justify-content:space-between;gap:6px;}
        .nav-section-tag{font-size:9.5px;font-weight:500;background:var(--bg3);color:var(--text3);padding:1px 6px;border-radius:10px;text-transform:none;letter-spacing:0;white-space:nowrap;flex-shrink:0;}
        .nav-section-toggle{width:100%;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;transition:color .12s;}
        .nav-section-toggle:hover{color:var(--r);}
        .nav-section-toggle:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;border-radius:6px;}
        .nav-section-meta{display:flex;align-items:center;gap:6px;}
        .nav-chevron{transition:transform .2s ease;flex-shrink:0;}
        .nav-chevron--offen{transform:rotate(90deg);}
        .nav-section-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .2s ease;}
        .nav-section-body--offen{grid-template-rows:1fr;}
        .nav-section-inner{overflow:hidden;min-height:0;transition:visibility .2s;}
        .nav-section-body:not(.nav-section-body--offen) .nav-section-inner{visibility:hidden;}
        @media (prefers-reduced-motion: reduce){.nav-section-body,.nav-chevron{transition:none;}}
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
