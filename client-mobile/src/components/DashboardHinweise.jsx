import { useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'

// Kopfzeile des Mini-Dashboards: Ungelesenes und (für Berechtigte) offene Urlaubsanträge auf einen Blick
export default function DashboardHinweise({ hasArea, ungelesen, onNavigate }) {
  const darfFreigeben = hasArea('hr.urlaubskalender')
  const [offen, setOffen] = useState(null)
  useEffect(() => {
    if (!darfFreigeben) return
    fetch('/api/vacation/offen', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((l) => l && setOffen(l.length)).catch(() => {})
  }, [darfFreigeben, ungelesen])

  return (
    <div className="hinweis-zeile">
      <button type="button" className="card card-clickable" onClick={() => onNavigate('mitteilungen')}>
        <Bell size={16} /> <strong>{ungelesen}</strong> <span className="card-sub">ungelesen</span>
      </button>
      {darfFreigeben && (
        <button type="button" className="card card-clickable" onClick={() => onNavigate('freigaben')}>
          <CheckCheck size={16} /> <strong>{offen ?? '–'}</strong> <span className="card-sub">Anträge offen</span>
        </button>
      )}
    </div>
  )
}
