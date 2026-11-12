import { useEffect, useState } from 'react'
import { UserX } from 'lucide-react'

const tag = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

// „Diese Woche abwesend“ wie am PC (GET /api/dashboard/abwesend, für alle sichtbar)
export default function Abwesend() {
  const [liste, setListe] = useState(null)
  useEffect(() => {
    fetch('/api/dashboard/abwesend', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => setListe(d ? d.abwesend : [])).catch(() => setListe([]))
  }, [])
  if (!liste || liste.length === 0) return null
  return (
    <>
      <h2 className="section-title"><UserX size={17} />Diese Woche abwesend</h2>
      <ul className="card-list">
        {liste.map((a) => (
          <li key={a.name + a.typ + a.von} className="card">
            <span>{a.name}</span>
            <span className="card-sub">{a.typ} · {tag(a.von)}{a.bis && tag(a.bis) !== tag(a.von) ? ` – ${tag(a.bis)}` : ''}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
