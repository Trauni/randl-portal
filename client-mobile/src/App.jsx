import { useCallback, useEffect, useState } from 'react'
import { Menu, Bell } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import BurgerMenu from './components/BurgerMenu.jsx'
import MiniDashboard from './components/MiniDashboard.jsx'
import Profile from './components/Profile.jsx'
import Vacation from './components/Vacation.jsx'
import NewCustomer from './components/NewCustomer.jsx'
import NewOrder from './components/NewOrder.jsx'
import CustomerQr from './components/CustomerQr.jsx'
import Notes from './components/Notes.jsx'
import Zeiterfassung from './components/Zeiterfassung.jsx'
import WidmannBestand from './components/WidmannBestand.jsx'
import DeliveryRhythm from './components/DeliveryRhythm.jsx'
import MetallFotos from './components/MetallFotos.jsx'
import Mitteilungen from './components/Mitteilungen.jsx'
import Freigaben from './components/Freigaben.jsx'

// Bewusst kein react-router in Phase 1/2 -- wenige Ansichten, einfacher
// State-Switch reicht und spart eine Abhaengigkeit. Bei Bedarf (mehr Ansichten
// inkl. Detail-/Formularseiten) auf react-router-dom umstellen, analog zum
// Webshop-Fix in F17 (Seite 71).
const VIEWS = {
  dashboard: MiniDashboard,
  profil: Profile,
  urlaub: Vacation,
  kunden: NewCustomer,
  bestellung: NewOrder,
  'kunden-qr': CustomerQr,
  notizen: Notes,
  zeit: Zeiterfassung,
  'widmann-bestand': WidmannBestand,
  'lieferrhythmus': DeliveryRhythm,
  'metall-fotos': MetallFotos,
  mitteilungen: Mitteilungen,
  freigaben: Freigaben,
}

// Links aus Push-Mitteilungen: /mobile/#/freigaben
const ansichtAusHash = () => {
  const v = window.location.hash.replace(/^#\/?/, '')
  return VIEWS[v] ? v : null
}

function Shell() {
  const { user, loading, hasArea } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState(() => ansichtAusHash() || 'dashboard')
  const [ungelesen, setUngelesen] = useState(0)

  const ladeAnzahl = useCallback(() => {
    fetch('/api/mitteilungen/anzahl', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => d && setUngelesen(d.ungelesen)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return undefined
    ladeAnzahl()
    const t = setInterval(ladeAnzahl, 60000)
    const beiHash = () => { const v = ansichtAusHash(); if (v) { setView(v); ladeAnzahl() } }
    const beiSicht = () => { if (document.visibilityState === 'visible') ladeAnzahl() }
    window.addEventListener('hashchange', beiHash)
    document.addEventListener('visibilitychange', beiSicht)
    return () => { clearInterval(t); window.removeEventListener('hashchange', beiHash); document.removeEventListener('visibilitychange', beiSicht) }
  }, [user, ladeAnzahl])

  const geheZu = (v) => { setView(v); setMenuOpen(false); if (window.location.hash) window.history.replaceState(null, '', window.location.pathname) }

  if (loading) return <div className="center-msg">Lädt…</div>
  if (!user) return <div className="center-msg">Weiterleitung zum Login…</div>

  const View = VIEWS[view] || MiniDashboard

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Menü" onClick={() => setMenuOpen(true)}>
          <Menu size={22} />
        </button>
        <span className="topbar-title">Randl Mitarbeiterportal</span>
        <button type="button" className="icon-btn bell-btn" aria-label="Mitteilungen" onClick={() => geheZu('mitteilungen')}>
          <Bell size={22} />
          {ungelesen > 0 && <span className="bell-badge">{ungelesen > 99 ? '99+' : ungelesen}</span>}
        </button>
        <div className="avatar">{user.avatarInitials || '?'}</div>
      </header>

      {menuOpen && (
        <BurgerMenu
          user={user}
          hasArea={hasArea}
          activeView={view}
          onNavigate={geheZu}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <main className="content">
        <View hasArea={hasArea} user={user} onNavigate={geheZu} onGelesen={ladeAnzahl} ungelesen={ungelesen} />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
