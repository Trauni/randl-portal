import {
  LayoutDashboard, ShoppingCart, UserPlus, QrCode, NotebookPen,
  Plane, Clock, User, LogOut, ClipboardList, CalendarDays, Camera,
} from 'lucide-react'

const ITEMS = [
  { key: 'dashboard', label: 'Mini-Dashboard', area: 'dashboard', icon: LayoutDashboard },
  { key: 'bestellung', label: 'Bestellung erfassen', area: 'gashandel', icon: ShoppingCart },
  { key: 'kunden', label: 'Neue Kunden anlegen', area: 'gashandel', icon: UserPlus },
  { key: 'kunden-qr', label: 'Kunden-QR-Code', area: 'gashandel', icon: QrCode },
  { key: 'widmann-bestand', label: 'Widmann zählen', area: 'gashandel', icon: ClipboardList },
  { key: 'lieferrhythmus', label: 'Lieferrhythmus', area: 'gashandel', icon: CalendarDays },
  { key: 'metall-fotos', label: 'Maschinenbau: Fotos', area: 'metallarbeiten.vorgaenge', icon: Camera },
  { key: 'notizen', label: 'Notizen', area: 'notizen', icon: NotebookPen },
  { key: 'urlaub', label: 'Mein Urlaub', area: 'urlaub.eigen', icon: Plane },
  { key: 'zeit', label: 'Zeiterfassung', area: 'zeit.eigen', icon: Clock },
  { key: 'profil', label: 'Profil', area: 'profil', icon: User },
]

export default function BurgerMenu({ user, hasArea, activeView, onNavigate, onClose }) {
  return (
    <div className="menu-overlay" onClick={onClose}>
      <nav className="menu-panel" onClick={(e) => e.stopPropagation()}>
        <div className="menu-user-row">
          <div className="avatar large">{user.avatarInitials || '?'}</div>
          <div>
            <div className="menu-user-name">{user.fullName || user.username}</div>
            <div className="menu-user-role">{user.role}</div>
          </div>
        </div>

        {ITEMS.filter((item) => hasArea(item.area)).map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              className={`menu-item${activeView === item.key ? ' active' : ''}`}
              disabled={item.disabled}
              onClick={() => !item.disabled && onNavigate(item.key)}
            >
              <Icon size={18} />
              <span className="menu-item-label">{item.label}</span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          )
        })}

        <a className="menu-item menu-logout" href="/auth/logout">
          <LogOut size={18} />
          <span className="menu-item-label">Abmelden</span>
        </a>
      </nav>
    </div>
  )
}
