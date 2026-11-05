import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout/Layout'
import Dashboard from './components/pages/Dashboard'
import VacationRequest from './components/pages/VacationRequest'
import Lieferantenauftrag from './components/pages/Lieferantenauftrag'
import MetallVorgaenge from './components/pages/metall/Vorgaenge'
import MetallZuordnen from './components/pages/metall/Zuordnen'
import MetallEingang from './components/pages/metall/Eingang'
import MetallVorgangDetail from './components/pages/metall/VorgangDetail'
import Metallkunden from './components/pages/metall/Metallkunden'
import VacationCalendar from './components/pages/VacationCalendar'
import Profile from './components/pages/Profile'
import SystemDashboard from './components/pages/it/SystemDashboard'
import CloudflareDNS   from './components/pages/it/CloudflareDNS'
import SpamDashboard   from './components/pages/it/SpamDashboard'
import Docker          from './components/pages/it/Docker'
import Cleanup from './components/pages/it/Cleanup'
import Wartung from './components/pages/it/Wartung'
import Orders   from './components/pages/finance/Orders';
import Products from './components/pages/finance/Products';
import Customers       from './components/pages/finance/Customers';
import DeliveryRhythm from './components/pages/finance/DeliveryRhythm';
import ShopNews from './components/pages/finance/ShopNews';
import InfoMail from './components/pages/finance/InfoMail';
import WidmannBestand from './components/pages/finance/WidmannBestand';
import Logs     from './components/pages/it/Logs'
import { CmsPage, CmsEditorPage } from './components/pages/content/CmsEditor'
import Mitarbeiter from './components/pages/hr/Mitarbeiter'
import Bilderverwaltung from './components/pages/content/Bilderverwaltung'
import CMSShopseite from './components/pages/content/CMSShopseite'
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
        <Route path="metallarbeiten/lieferantenauftraege" element={<Lieferantenauftrag />} />
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
        <Route path="it/system"     element={<SystemDashboard />} />
        <Route path="it/cloudflare" element={<CloudflareDNS />} />
        <Route path="it/spam"       element={<SpamDashboard />} />
        <Route path="it/docker"     element={<Docker />} />
        <Route path="it/logs"     element={<Logs />} />
              <Route path="it/cleanup" element={<Cleanup />} />
              <Route path="it/maintenance" element={<Wartung />} />
        <Route path="finance/kunden"       element={<Customers />} />
        <Route path="finance/rhythmus"  element={<DeliveryRhythm />} />
        <Route path="finance/mitteilungen" element={<ShopNews />} />
        <Route path="finance/info-mail" element={<InfoMail />} />
        <Route path="finance/widmann-bestand" element={<WidmannBestand />} />
        <Route path="finance/bestellungen" element={<Orders />} />
        <Route path="finance/produkte"     element={<Products />} />
        <Route path="content/cms" element={<CmsPage />} />
        <Route path="content/cms/edit/:id" element={<CmsEditorPage />} />
        <Route path="content/bilder" element={<Bilderverwaltung />} />
        <Route path="content/shop" element={<CMSShopseite />} />
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
