import { useState } from 'react'
import { Menu } from 'lucide-react'
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
}

function Shell() {
  const { user, loading, hasArea } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState('dashboard')

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
        <div className="avatar">{user.avatarInitials || '?'}</div>
      </header>

      {menuOpen && (
        <BurgerMenu
          user={user}
          hasArea={hasArea}
          activeView={view}
          onNavigate={(v) => { setView(v); setMenuOpen(false) }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <main className="content">
        <View hasArea={hasArea} user={user} />
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
