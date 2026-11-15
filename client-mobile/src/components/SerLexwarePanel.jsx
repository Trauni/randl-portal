import { useEffect, useState } from 'react'
import { AlertTriangle, UploadCloud, FileUp } from 'lucide-react'

// Am Handy angelegte Kunden/Bestellungen lösen KEINEN automatischen SER-/Lexware-Push aus, das
// passiert bewusst separat. Das Panel zeigt, was noch offen ist, und bietet die Sammel-Übertragung.
//
// Die Bestellungen-Zahl kommt aus kacheln.bestellungenOhneSer (/api/dashboard), nicht aus einem
// eigenen Zähler: die Kachel filtert stornierte, erledigte, bereits übertragene und Kunden ohne in_ser_fvk
// heraus. Beim Absenden wird clientseitig genauso gefiltert.
export default function SerLexwarePanel({ ohneSer, onSerFertig }) {
  const [pendingCustomers, setPendingCustomers] = useState(null)
  const [serBusy, setSerBusy] = useState(false)
  const [serMsg, setSerMsg] = useState(null)
  const [lexBusy, setLexBusy] = useState(false)
  const [lexMsg, setLexMsg] = useState(null)

  const loadPendingCustomers = () => {
    fetch('/api/finance/customers?in_lexware=false&limit=1', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => d && setPendingCustomers(d.total ?? 0))
      .catch(() => {})
  }
  useEffect(loadPendingCustomers, [])

  const submitSer = async () => {
    setSerBusy(true)
    setSerMsg(null)
    try {
      const listRes = await fetch('/api/finance/orders?ser_filter=not_sent&limit=500', { credentials: 'include' })
      const listData = await listRes.json()
      const ids = (listData.orders || []).filter((o) => o.status !== 'cancelled' && o.in_ser_fvk && !o.done).map((o) => o.id)
      if (ids.length === 0) { setSerMsg('Keine offenen Bestellungen.'); return }
      const res = await fetch('/api/finance/orders/mass-ser', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) { setSerMsg(data.error || 'Fehler beim Übermitteln.'); return }
      setSerMsg(`${ids.length} Bestellung(en) an SER übermittelt.`)
      onSerFertig?.()
    } catch {
      setSerMsg('Server nicht erreichbar.')
    } finally {
      setSerBusy(false)
    }
  }

  const pollLexwareJob = (jobId) => {
    fetch(`/api/finance/customers/bulk-push/${jobId}/status`, { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => {
        if (d.status === 'running') {
          setLexMsg(`Läuft… ${d.processed ?? 0}/${d.total ?? '?'}`)
          setTimeout(() => pollLexwareJob(jobId), 1500)
        } else {
          setLexMsg(
            `Fertig: ${d.success ?? 0} übertragen, ${d.errors ?? 0} Fehler` +
            (d.skippedDuplicate ? `, ${d.skippedDuplicate} Duplikate übersprungen` : '') + '.'
          )
          setLexBusy(false)
          loadPendingCustomers()
        }
      })
      .catch(() => { setLexMsg('Status nicht abrufbar.'); setLexBusy(false) })
  }

  const submitLexware = async () => {
    setLexBusy(true)
    setLexMsg(null)
    try {
      const listRes = await fetch('/api/finance/customers?in_lexware=false&limit=200', { credentials: 'include' })
      const listData = await listRes.json()
      const ids = (listData.customers || []).map((c) => c.id)
      if (ids.length === 0) { setLexMsg('Keine offenen Kunden.'); setLexBusy(false); return }
      const res = await fetch('/api/finance/customers/bulk-push', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerIds: ids }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) { setLexMsg(data.error || 'Fehler beim Start.'); setLexBusy(false); return }
      pollLexwareJob(data.jobId)
    } catch {
      setLexMsg('Server nicht erreichbar.')
      setLexBusy(false)
    }
  }

  const offen = (ohneSer > 0 ? ohneSer : 0) + (pendingCustomers > 0 ? pendingCustomers : 0)

  return (
    <details className="dash-details" open={offen > 0}>
      <summary>
        <UploadCloud size={16} /> Übertragung an SER / Lexware
        {offen > 0 && <span className="dash-count">{offen} offen</span>}
      </summary>
      {offen > 0 && (
        <div className="notice-banner">
          <AlertTriangle size={16} />
          <span>
            {ohneSer > 0 && <>{ohneSer} Bestellung{ohneSer === 1 ? '' : 'en'} ohne SER</>}
            {ohneSer > 0 && pendingCustomers > 0 && ' · '}
            {pendingCustomers > 0 && <>{pendingCustomers} Kunde{pendingCustomers === 1 ? '' : 'n'} nicht in Lexware</>}
          </span>
        </div>
      )}
      <div className="sync-buttons">
        <button type="button" className="sync-btn" onClick={submitSer} disabled={serBusy}>
          <UploadCloud size={16} /> {serBusy ? 'Läuft…' : 'SER übermitteln'}
        </button>
        <button type="button" className="sync-btn" onClick={submitLexware} disabled={lexBusy}>
          <FileUp size={16} /> {lexBusy ? 'Läuft…' : 'Lexware übermitteln'}
        </button>
      </div>
      {serMsg && <p className="hint">{serMsg}</p>}
      {lexMsg && <p className="hint">{lexMsg}</p>}
    </details>
  )
}
