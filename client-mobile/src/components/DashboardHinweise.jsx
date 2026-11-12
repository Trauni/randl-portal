import { useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'

// Was gerade Aufmerksamkeit braucht. Kacheln erscheinen nur, wenn sie für die Person relevant sind.
export default function DashboardHinweise({ hasArea, ungelesen, onNavigate }) {
  const darfFreigeben = hasArea('hr.urlaubskalender')
  const [offen, setOffen] = useState(null)
  useEffect(() => {
    if (!darfFreigeben) return
    fetch('/api/vacation/offen', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((l) => l && setOffen(l.length)).catch(() => {})
  }, [darfFreigeben, ungelesen])

  const kacheln = [
    { key: 'mitteilungen', icon: Bell, zahl: ungelesen, label: 'ungelesen', aktiv: ungelesen > 0 },
    darfFreigeben && { key: 'freigaben', icon: CheckCheck, zahl: offen ?? '–', label: 'Anträge offen', aktiv: offen > 0 },
  ].filter(Boolean)

  return (
    <div className="hinweis-zeile">
      {kacheln.map(({ key, icon: Icon, zahl, label, aktiv }) => (
        <button key={key} type="button" className={`card card-clickable hinweis-kachel${aktiv ? ' hinweis-aktiv' : ''}`}
          onClick={() => onNavigate(key)}>
          <Icon size={16} /> <strong>{zahl}</strong> <span className="card-sub">{label}</span>
        </button>
      ))}
    </div>
  )
}
