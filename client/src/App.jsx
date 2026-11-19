import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout/Layout'
import Dashboard from './components/pages/Dashboard'
import VacationRequest from './components/pages/VacationRequest'
import MetallVorgaenge from './components/pages/metall/Vorgaenge'
import MetallZuordnen from './components/pages/metall/Zuordnen'
import MetallEingang from './components/pages/metall/Eingang'
import MetallVorgangDetail from './components/pages/metall/VorgangDetail'
import Metallkunden from './components/pages/metall/Metallkunden'
import VacationCalendar from './components/pages/VacationCalendar'
import Profile from './components/pages/Profile'
import ITBereich from './components/pages/it/ITBereich'
import Orders   from './components/pages/finance/Orders';
import Customers       from './components/pages/finance/Customers';
import DeliveryRhythm from './components/pages/finance/DeliveryRhythm';
import ShopNews from './components/pages/finance/ShopNews';
import InfoMail from './components/pages/finance/InfoMail';
import WidmannBestand from './components/pages/finance/WidmannBestand';
import GasAuswertung from './components/pages/finance/GasAuswertung';
import EinkaufspreiseWeiter from './components/pages/finance/EinkaufspreiseWeiter';
import ArtikelListe from './components/pages/finance/ArtikelListe';
import ArtikelDetail from './components/pages/finance/ArtikelDetail';
import Ladebasen from './components/pages/finance/Ladebasen';
import Disposition from './components/pages/finance/Disposition';
import { CmsPage, CmsEditorPage } from './components/pages/content/CmsEditor'
import Mitarbeiter from './components/pages/hr/Mitarbeiter'
import Bilderverwaltung from './components/pages/content/Bilderverwaltung'
import CMSShopseite from './components/pages/content/CMSShopseite'
import Hinweisbalken from './components/pages/content/Hinweisbalken'
import Zeiterfassung from './components/pages/hr/Zeiterfassung'
import Zeltplaner from './components/pages/zeltverleih/Zeltplaner'
import Zeltprojekte from './components/pages/zeltverleih/Zeltprojekte'

function AuthGuard({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">ℛ</div>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Wird geladen…</p>
      </div>
    )
  }
  if (!user) {
    window.location.href = '/auth/login'
    return null
  }
  return children
}

function AppRoutes() {
  const { hasArea } = useAuth()
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="urlaub" element={<VacationRequest />} />
        <Route path="metallarbeiten/vorgaenge" element={
          hasArea('metallarbeiten.vorgaenge') ? <MetallVorgaenge /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="metallarbeiten/vorgaenge/:id" element={
          hasArea('metallarbeiten.vorgaenge') ? <MetallVorgangDetail /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="metallarbeiten/kunden" element={
          hasArea('metallarbeiten.kunden') ? <Metallkunden /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="metallarbeiten/eingang" element={
          hasArea('metallarbeiten.vorgaenge') ? <MetallEingang /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="metallarbeiten/zuordnen" element={
          hasArea('metallarbeiten.vorgaenge') ? <MetallZuordnen /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="profil" element={<Profile />} />
        {/* HR-Sektion */}
        <Route path="hr/urlaubskalender" element={
          hasArea('hr.urlaubskalender') ? <VacationCalendar /> : <Navigate to="/dashboard" replace />
        } />
        {/* Legacy-Redirect */}
        <Route path="zeit" element={<Zeiterfassung eigen />} />
        <Route path="hr/zeiterfassung" element={
          hasArea('hr.zeitauswertung') ? <Zeiterfassung /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="hr/mitarbeiter" element={
          hasArea('hr.mitarbeiter') ? <Mitarbeiter /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="urlaub/kalender" element={<Navigate to="/hr/urlaubskalender" replace />} />
        {/* IT: alle Dashboards auf einer Seite mit Tabs */}
        <Route path="it" element={<Navigate to="/it/system" replace />} />
        <Route path="it/:tab" element={
          hasArea('it') ? <ITBereich /> : <Navigate to="/dashboard" replace />
        } />
        <Route path="finance/kunden"       element={<Customers />} />
        <Route path="finance/rhythmus"  element={<DeliveryRhythm />} />
        <Route path="finance/mitteilungen" element={<ShopNews />} />
        <Route path="finance/info-mail" element={<InfoMail />} />
        <Route path="finance/widmann-bestand" element={<WidmannBestand />} />
        <Route path="gashandel/auswertung" element={<GasAuswertung />} />
        {/* Alte Seiten Artikelstamm, Produkte und Einkaufspreise sind in „Artikel“ aufgegangen (#606) */}
        <Route path="gashandel/artikel" element={<Navigate to="/gashandel/artikel/liste" replace />} />
        <Route path="gashandel/artikel/liste" element={<ArtikelListe />} />
        <Route path="gashandel/artikel/:nr" element={<ArtikelDetail />} />
        <Route path="gashandel/einkaufspreise" element={<EinkaufspreiseWeiter />} />
        <Route path="gashandel/ladebasen" element={<Ladebasen />} />
        <Route path="gashandel/disposition" element={<Disposition />} />
        <Route path="gashandel/tourplanung" element={<Navigate to="/gashandel/disposition" replace />} />
        <Route path="finance/bestellungen" element={<Orders />} />
        <Route path="finance/produkte"     element={<Navigate to="/gashandel/artikel/liste" replace />} />
        <Route path="content/cms" element={<CmsPage />} />
        <Route path="content/cms/edit/:id" element={<CmsEditorPage />} />
        <Route path="content/bilder" element={<Bilderverwaltung />} />
        <Route path="content/shop" element={<CMSShopseite />} />
        <Route path="content/hinweis" element={<Hinweisbalken />} />
        <Route path="zeltverleih/zeltplaner" element={<Zeltplaner />} />
        <Route path="zeltverleih/projekte" element={<Zeltprojekte />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppRoutes />
      </AuthGuard>
    </AuthProvider>
  )
}
