import { ShoppingCart, UserPlus, Plane, Clock, NotebookPen, ClipboardList } from 'lucide-react'

// Die häufigsten Wege vom Startbildschirm aus, nur mit passender Berechtigung
const AKTIONEN = [
  { key: 'bestellung', label: 'Bestellung erfassen', area: 'gashandel', icon: ShoppingCart },
  { key: 'kunden', label: 'Neuer Kunde', area: 'gashandel', icon: UserPlus },
  { key: 'widmann-bestand', label: 'Widmann zählen', area: 'gashandel', icon: ClipboardList },
  { key: 'urlaub', label: 'Urlaub', area: 'urlaub.eigen', icon: Plane },
  { key: 'zeit', label: 'Zeiterfassung', area: 'zeit.eigen', icon: Clock },
  { key: 'notizen', label: 'Notizen', area: 'notizen', icon: NotebookPen },
]

export default function Schnellaktionen({ hasArea, onNavigate }) {
  const sichtbar = AKTIONEN.filter((a) => hasArea(a.area))
  if (sichtbar.length === 0) return null
  return (
    <div className="aktionen-grid">
      {sichtbar.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" className="aktion-kachel" onClick={() => onNavigate(key)}>
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
