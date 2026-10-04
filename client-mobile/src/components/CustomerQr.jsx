import { useEffect, useState } from 'react'
import { Search, QrCode } from 'lucide-react'

// Verifiziert gegen /srv/docker/gas-webshop/admin-backend/src/routes/customers.js (11.08.2026):
// GET /api/finance/customers/:id/qr-code -> { url, qr: "data:image/png;base64,...", customer }
// url = https://shop.randl.group/?kd=<Kundennummer>&plz=<PLZ> -- fuer Erstanmeldung/Passwort-Reset
// im Kunden-Webshop.
//
// Am 11.08. gepatcht: die Kundennummer im QR-Code nimmt jetzt bevorzugt
// lexware_customer_number (die kuenftig fuehrende Nummer, siehe Rechnung), faellt sonst auf
// die alte customer_number (SER) zurueck. Vorher stand dort immer nur customer_number --
// das war vermutlich die Ursache dafuer, dass Kunden sich zuletzt nur noch mit der
// SER-Nummer anmelden konnten.

function customerLabel(c) {
  return c.company_name || c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbenannt'
}

function useDebouncedSearch(endpoint, resultKey, minLen = 2) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.trim().length < minLen) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`${endpoint}?q=${encodeURIComponent(query.trim())}`, { credentials: 'include' })
        .then((res) => res.json())
        .then((d) => setResults(d[resultKey] || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query, endpoint, resultKey, minLen])

  return {
    query, setQuery, results, loading,
    clear: () => { setQuery(''); setResults([]) },
  }
}

export default function CustomerQr() {
  const customerSearch = useDebouncedSearch('/api/finance/customers', 'customers')
  const [qr, setQr] = useState(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [error, setError] = useState(null)

  const showQr = async (customer) => {
    setError(null)
    setLoadingQr(true)
    setQr(null)
    try {
      const res = await fetch(`/api/finance/customers/${customer.id}/qr-code`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'QR-Code konnte nicht erzeugt werden.')
      } else {
        setQr(data)
      }
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setLoadingQr(false)
      customerSearch.clear()
    }
  }

  if (qr) {
    return (
      <section>
        <h2 className="section-title"><QrCode size={17} />Erstanmeldung</h2>
        <div className="qr-card">
          <img src={qr.qr} alt="QR-Code Erstanmeldung" className="qr-image" />
          <p className="qr-customer">{qr.customer}</p>
          <p className="hint">
            Kunde scannt den Code, um sich im Webshop erstmalig anzumelden bzw. das Passwort zu setzen.
          </p>
        </div>
        <button type="button" className="link-btn" onClick={() => setQr(null)}>Anderen Kunden suchen</button>
      </section>
    )
  }

  return (
    <section>
      <h2 className="section-title"><QrCode size={17} />Kunden-QR-Code</h2>
      <div className="search-box">
        <Search size={16} />
        <input
          placeholder="Kunde suchen (Name, Kundennummer, Ort)…"
          value={customerSearch.query}
          onChange={(e) => customerSearch.setQuery(e.target.value)}
        />
      </div>
      {customerSearch.loading && <p className="hint">Suche…</p>}
      {loadingQr && <p className="hint">QR-Code wird erzeugt…</p>}
      {error && <p className="error">{error}</p>}
      <ul className="card-list">
        {customerSearch.results.map((c) => (
          <li key={c.id} className="card card-clickable" onClick={() => showQr(c)}>
            <span>{customerLabel(c)}</span>
            <span className="card-sub">{c.customer_number} · {c.billing_city || '–'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
