import { useEffect, useState } from 'react'
import { Search, Plus, Trash2, ShoppingCart } from 'lucide-react'

// Verifiziert direkt gegen den Admin-Backend-Quellcode (11.08.2026,
// /srv/docker/gas-webshop/admin-backend/src/routes/):
//
// GET /api/finance/customers?q=  -> { customers: [{ id, customer_number, name, name2,
//   company_name, first_name, last_name, billing_street, billing_zip, billing_city,
//   email, phone, mobile, ... }], total }
//
// GET /api/finance/products?q=   -> { products: [{ id, articleNumber, name, unit, price }] }
//   price = Lexware-Nettopreis. Kein taxRate-Feld -- 19% MwSt fix angenommen, wie im
//   restlichen Bestell-Code (webshop-orders.js PUT-Handler: calcGross = calcNet * 1.19).
//
// POST /api/finance/orders  (== /admin/webshop-orders, 1:1-Proxy) -> Body:
//   { customer_id, customer_number, customer_name, customer_email,
//     items: [{ productId, articleNumber, productName, unitPriceNet, unit, taxRate,
//               quantity, emptyReturn }],
//     total_net, total_gross, delivery_note, delivery_address_id, status }
//   total_net/total_gross werden vom Server NICHT automatisch berechnet -- das
//   uebernimmt hier der Client (anders als beim PUT-Bearbeiten-Handler).
//
// Bewusst KEINE Preise in der Mobile-UI (Wunsch des Nutzers, 11.08.2026): die Kollegen
// sollen unterwegs nur schnell Kunde + Artikel + Menge erfassen koennen, ohne sich um
// Preise zu kuemmern. Der Preis wird intern aus der Produktsuche mitgefuehrt (fuer
// total_net/total_gross im Request), aber nirgends angezeigt.
//
// created_by/channel-Spalten existieren in webshop_orders (noch) nicht -- die Herkunft
// wird pragmatisch im delivery_note vermerkt ("[Mobile] erfasst von ..."), ohne
// Schema-Migration, analog zum bisherigen Stil im Projekt. status bleibt "new" --
// SER-Push und Preispruefung laufen wie bei allen Bestellungen ganz normal im
// Backoffice/Finance weiter.
//
// F51 (09.09.2026): "Letzte Bestellung erneut bestellen". Gleiches Muster wie der
// Desktop-Reorder aus F47 (Orders.jsx, startReorder): GET /api/finance/orders?q=
// liefert die Bestellhistorie eines Kunden, davon wird die neueste genommen. Für
// jeden Artikel wird der aktuelle Preis gezielt per Artikelnummer nachgeschlagen
// (GET /api/finance/products?q=<articleNumber>), da der Katalog-Endpoint ohne
// q-Parameter keinen vollstaendigen Katalog liefert. Nicht mehr existierende
// Artikel werden stillschweigend entfernt, mit Hinweis wie viele.

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

function customerLabel(c) {
  return c.company_name || c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbenannt'
}

export default function NewOrder({ user }) {
  const customerSearch = useDebouncedSearch('/api/finance/customers', 'customers')
  const productSearch = useDebouncedSearch('/api/finance/products', 'products')

  const [customer, setCustomer] = useState(null)
  const [items, setItems] = useState([])
  const [note, setNote] = useState('')
  const [qtyDraft, setQtyDraft] = useState({})

  const [lastOrder, setLastOrder] = useState(null)
  const [reorderBusy, setReorderBusy] = useState(false)
  const [reorderNotice, setReorderNotice] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!customer) { setLastOrder(null); return }
    fetch(`/api/finance/orders?q=${encodeURIComponent(customer.customer_number || '')}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => {
        const list = d.orders || []
        const sorted = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setLastOrder(sorted[0] || null)
      })
      .catch(() => setLastOrder(null))
  }, [customer])

  const doReorder = async (order) => {
    setReorderBusy(true)
    setReorderNotice('')
    try {
      const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || [])
      const lookups = await Promise.all(orderItems.map((it) =>
        fetch(`/api/finance/products?q=${encodeURIComponent(it.articleNumber)}`, { credentials: 'include' }).then((r) => r.json())
      ))
      const validItems = orderItems.map((it, idx) => {
        const current = (lookups[idx].products || []).find((p) => p.articleNumber === it.articleNumber)
        if (!current) return null
        return {
          productId: current.id,
          articleNumber: current.articleNumber,
          productName: current.name,
          unitPriceNet: current.price || 0,
          unit: current.unit || 'Stk',
          taxRate: 19,
          quantity: it.quantity,
          emptyReturn: it.emptyReturn ?? it.quantity,
        }
      }).filter(Boolean)
      const dropped = orderItems.length - validItems.length
      setItems(validItems)
      setReorderNotice(dropped > 0 ? `${dropped} Artikel nicht mehr verfügbar und entfernt.` : '')
    } catch {
      setError('Erneut bestellen fehlgeschlagen.')
    } finally {
      setReorderBusy(false)
    }
  }

  const addItem = (product) => {
    const qty = Math.max(1, parseInt(qtyDraft[product.id] || '1', 10) || 1)
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + qty, emptyReturn: i.quantity + qty } : i
        )
      }
      return [...prev, {
        productId: product.id,
        articleNumber: product.articleNumber,
        productName: product.name,
        unitPriceNet: product.price || 0,
        unit: product.unit || 'Stk',
        taxRate: 19,
        quantity: qty,
        emptyReturn: qty,
      }]
    })
    productSearch.clear()
  }

  const removeItem = (productId) => setItems((prev) => prev.filter((i) => i.productId !== productId))

  const updateQty = (productId, qty) => {
    const n = Math.max(1, parseInt(qty, 10) || 1)
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity: n, emptyReturn: n } : i)))
  }

  const submit = async () => {
    if (!customer || items.length === 0) return
    setError(null)
    setSubmitting(true)
    const totalNet = Math.round(items.reduce((s, i) => s + i.unitPriceNet * i.quantity, 0) * 100) / 100
    const totalGross = Math.round(totalNet * 1.19 * 100) / 100
    const createdBy = user?.username || user?.fullName || 'Mitarbeiter'
    try {
      const res = await fetch('/api/finance/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer.id,
          customer_number: customer.customer_number,
          customer_name: customerLabel(customer),
          customer_email: customer.email || '',
          items,
          total_net: totalNet,
          total_gross: totalGross,
          delivery_note: note.trim() || null,
          status: 'new',
          channel: 'mobile',
          created_by: createdBy,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Bestellung konnte nicht angelegt werden.')
      } else {
        setResult({ ...data, itemCount: items.length })
      }
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setCustomer(null)
    setItems([])
    setNote('')
    setResult(null)
    setError(null)
    setLastOrder(null)
    setReorderNotice('')
    customerSearch.clear()
    productSearch.clear()
  }

  if (result) {
    return (
      <section>
        <h2 className="section-title"><ShoppingCart size={17} />Bestellung erfasst</h2>
        <ul className="card-list">
          <li className="card">
            <span>{result.customer_name}</span>
            <span className="card-sub">
              {result.itemCount} Position{result.itemCount === 1 ? '' : 'en'} · Status: neu
            </span>
          </li>
        </ul>
        <p className="hint">
          Weiterverarbeitung (Preisprüfung, SER/Lexware-Übertragung) läuft wie gewohnt im Backoffice.
        </p>
        <button type="button" className="link-btn" onClick={reset}>Weitere Bestellung erfassen</button>
      </section>
    )
  }

  return (
    <section>
      <h2 className="section-title"><ShoppingCart size={17} />Bestellung erfassen</h2>

      {!customer && (
        <>
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Kunde suchen (Name, Kundennummer, Ort)…"
              value={customerSearch.query}
              onChange={(e) => customerSearch.setQuery(e.target.value)}
            />
          </div>
          {customerSearch.loading && <p className="hint">Suche…</p>}
          <ul className="card-list">
            {customerSearch.results.map((c) => (
              <li
                key={c.id}
                className="card card-clickable"
                onClick={() => { setCustomer(c); customerSearch.clear() }}
              >
                <span>{customerLabel(c)}</span>
                <span className="card-sub">{c.lexware_customer_number || c.customer_number} · {c.billing_city || '–'}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {customer && (
        <>
          <div className="card selected-card">
            <span>{customerLabel(customer)}</span>
            <span className="card-sub">{customer.lexware_customer_number || customer.customer_number}</span>
            <button type="button" className="link-btn" onClick={() => setCustomer(null)}>Ändern</button>
          </div>

          {lastOrder && items.length === 0 && (
            <div className="card">
              <span>Letzte Bestellung: {new Date(lastOrder.created_at).toLocaleDateString('de-DE')}</span>
              <span className="card-sub">
                {(typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items) : (lastOrder.items || [])).length} Position(en)
              </span>
              <button type="button" className="link-btn" disabled={reorderBusy} onClick={() => doReorder(lastOrder)}>
                {reorderBusy ? 'Lädt…' : '↺ Erneut bestellen'}
              </button>
            </div>
          )}
          {reorderNotice && <p className="hint">{reorderNotice}</p>}

          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Artikel suchen (Name, Artikelnummer)…"
              value={productSearch.query}
              onChange={(e) => productSearch.setQuery(e.target.value)}
            />
          </div>
          {productSearch.loading && <p className="hint">Suche…</p>}
          <ul className="card-list">
            {productSearch.results.map((p) => (
              <li key={p.id} className="card">
                <span>{p.name}</span>
                <span className="card-sub">{p.articleNumber} · {p.unit}</span>
                <div className="qty-row">
                  <input
                    type="number"
                    min="1"
                    className="qty-input"
                    value={qtyDraft[p.id] ?? 1}
                    onChange={(e) => setQtyDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <button type="button" className="add-btn" onClick={() => addItem(p)}>
                    <Plus size={16} /> Hinzufügen
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {items.length > 0 && (
            <>
              <h2 className="section-title">Positionen</h2>
              <ul className="card-list">
                {items.map((i) => (
                  <li key={i.productId} className="card">
                    <span>{i.productName}</span>
                    <div className="qty-row">
                      <input
                        type="number"
                        min="1"
                        className="qty-input"
                        value={i.quantity}
                        onChange={(e) => updateQty(i.productId, e.target.value)}
                      />
                      <span className="card-sub">{i.unit}</span>
                      <button type="button" className="remove-btn" onClick={() => removeItem(i.productId)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <label className="note-label">
                Hinweis (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Lieferung Freitag" />
              </label>

              {error && <p className="error">{error}</p>}
              <button type="button" onClick={submit} disabled={submitting} className="submit-order-btn">
                {submitting ? 'Wird erfasst…' : 'Bestellung erfassen'}
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}
