// Mitteilungen an alle Shop-Kunden (gasshop #283)
// Kunden sehen sie im Shop über die Glocke; neueste ungelesene zusätzlich als Hinweis.
import { useState, useEffect } from 'react';

const CATEGORIES = [['info', 'Info'], ['preise', 'Preise'], ['lieferung', 'Lieferung'], ['wichtig', 'Wichtig']];
const CAT_LABEL = Object.fromEntries(CATEGORIES);

const S = {
  card: { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.1rem', marginBottom: '.75rem' },
  label: { display: 'block', fontSize: '.75rem', color: 'var(--text2)', marginBottom: '.25rem' },
  input: { background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 6, padding: '.45rem .6rem', color: 'var(--text1)', fontSize: '.85rem', outline: 'none', width: '100%', fontFamily: 'inherit' },
  btn: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text1)', cursor: 'pointer', padding: '.4rem .8rem', fontSize: '.8rem' },
  btnPrimary: { background: 'var(--r, #c40000)', border: '1px solid var(--r, #c40000)', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '.45rem .9rem', fontSize: '.82rem', fontWeight: 600 },
  chip: { fontSize: '.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', padding: '.1rem .5rem', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text2)' },
};

// Datum aus der DB -> Wert für <input type="datetime-local"> (lokale Zeit)
function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmt(v) {
  if (!v) return '';
  return new Date(v).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function status(n) {
  const now = Date.now();
  if (new Date(n.visible_from).getTime() > now) return { text: 'geplant', color: 'var(--text3)' };
  if (n.visible_until && new Date(n.visible_until).getTime() <= now) return { text: 'abgelaufen', color: 'var(--text3)' };
  return { text: 'sichtbar', color: 'var(--green, #1d7a3e)' };
}

const EMPTY = { title: '', body: '', category: 'info', visible_from: '', visible_until: '', pinned: false };

function NewsForm({ initial, onSave, onCancel, saving, error }) {
  const [f, setF] = useState(() => initial ? {
    title: initial.title, body: initial.body, category: initial.category,
    visible_from: toLocalInput(initial.visible_from), visible_until: toLocalInput(initial.visible_until), pinned: !!initial.pinned,
  } : { ...EMPTY, visible_from: toLocalInput(new Date()) });
  const upd = k => e => setF(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  function submit(e) {
    e.preventDefault();
    onSave({
      title: f.title, body: f.body, category: f.category, pinned: f.pinned,
      visible_from: f.visible_from ? new Date(f.visible_from).toISOString() : null,
      visible_until: f.visible_until ? new Date(f.visible_until).toISOString() : null,
    });
  }
  return (
    <form onSubmit={submit} style={{ ...S.card, borderColor: 'var(--text3)' }}>
      <div style={{ marginBottom: '.7rem' }}>
        <label style={S.label}>Titel</label>
        <input style={S.input} value={f.title} onChange={upd('title')} maxLength={140} required autoFocus placeholder="z. B. Neue Preise ab 1. November" />
      </div>
      <div style={{ marginBottom: '.7rem' }}>
        <label style={S.label}>Text</label>
        <textarea style={{ ...S.input, minHeight: 110, resize: 'vertical' }} value={f.body} onChange={upd('body')} maxLength={4000} required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.7rem', marginBottom: '.7rem' }}>
        <div>
          <label style={S.label}>Kategorie</label>
          <select style={S.input} value={f.category} onChange={upd('category')}>
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Sichtbar ab</label>
          <input type="datetime-local" style={S.input} value={f.visible_from} onChange={upd('visible_from')} />
        </div>
        <div>
          <label style={S.label}>Sichtbar bis (optional)</label>
          <input type="datetime-local" style={S.input} value={f.visible_until} onChange={upd('visible_until')} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.82rem', color: 'var(--text1)', marginBottom: '.8rem' }}>
        <input type="checkbox" checked={f.pinned} onChange={upd('pinned')} /> Oben anheften
      </label>
      {error && <div style={{ color: 'var(--red2, #c40000)', fontSize: '.8rem', marginBottom: '.6rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button type="submit" style={S.btnPrimary} disabled={saving}>{saving ? "Speichere…" : 'Speichern'}</button>
        <button type="button" style={S.btn} onClick={onCancel} disabled={saving}>Abbrechen</button>
      </div>
    </form>
  );
}

export default function ShopNews() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true); setLoadError('');
    try {
      const r = await fetch('/api/finance/news');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Laden fehlgeschlagen');
      setNews(d.news || []);
    } catch (e) { setLoadError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(data) {
    setSaving(true); setFormError('');
    try {
      const isNew = editing === 'new';
      const r = await fetch('/api/finance/news' + (isNew ? '' : '/' + editing), {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Speichern fehlgeschlagen');
      setEditing(null);
      await load();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function remove(n) {
    if (!window.confirm(`Mitteilung „${n.title}“ wirklich löschen? Kunden sehen sie dann nicht mehr.`)) return;
    const r = await fetch('/api/finance/news/' + n.id, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || "Löschen fehlgeschlagen"); return; }
    load();
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text1)', marginBottom: '.2rem' }}>Mitteilungen</h1>
          <div style={{ fontSize: '.8rem', color: 'var(--text3)' }}>Hinweise an alle Kunden im Shop (Glocke). Neueste ungelesene erscheint zusätzlich auf der Startseite.</div>
        </div>
        {editing === null && <button style={S.btnPrimary} onClick={() => { setEditing('new'); setFormError(''); }}>+ Neue Mitteilung</button>}
      </div>

      {editing === 'new' && <NewsForm onSave={save} onCancel={() => setEditing(null)} saving={saving} error={formError} />}
      {loading && <div style={{ fontSize: '.85rem', color: 'var(--text3)' }}>Lade…</div>}
      {loadError && <div style={{ color: 'var(--red2, #c40000)', fontSize: '.85rem' }}>{loadError}</div>}
      {!loading && !loadError && news.length === 0 && editing !== 'new' && (
        <div style={{ ...S.card, color: 'var(--text3)', fontSize: '.85rem' }}>Noch keine Mitteilungen.</div>
      )}

      {news.map(n => editing === n.id ? (
        <NewsForm key={n.id} initial={n} onSave={save} onCancel={() => setEditing(null)} saving={saving} error={formError} />
      ) : (
        <div key={n.id} style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
            <span style={{ ...S.chip, ...(n.category === 'wichtig' ? { borderColor: 'var(--r, #c40000)', color: 'var(--r, #c40000)' } : {}) }}>{CAT_LABEL[n.category] || n.category}</span>
            {n.pinned && <span style={S.chip}>angeheftet</span>}
            <span style={{ fontSize: '.72rem', color: status(n).color, fontWeight: 600 }}>{status(n).text}</span>
            <span style={{ fontSize: '.72rem', color: 'var(--text3)' }}>
              ab {fmt(n.visible_from)}{n.visible_until ? ' bis ' + fmt(n.visible_until) : ''} · gelesen von {n.read_count || 0} Kunden
            </span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text1)', fontSize: '.92rem' }}>{n.title}</div>
          <div style={{ color: 'var(--text2)', fontSize: '.84rem', whiteSpace: 'pre-wrap', marginTop: '.2rem' }}>{n.body}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.7rem', gap: '.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.7rem', color: 'var(--text3)' }}>
              {n.updated_by ? "zuletzt geändert von " + n.updated_by : ''}
            </span>
            {editing === null && (
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button style={S.btn} onClick={() => { setEditing(n.id); setFormError(''); }}>Bearbeiten</button>
                <button style={{ ...S.btn, color: 'var(--red2, #c40000)' }} onClick={() => remove(n)}>Löschen</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
