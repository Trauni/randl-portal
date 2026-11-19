import { useState } from 'react';
import { Tag } from '../../../ui';

const zahl = (v) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 3 });

/**
 * Inhalt (Wert + Einheit kg/L) eines Lexware-Artikels, mit Bearbeiten (nur mit gashandel.preise).
 * Leer speichern entfernt den Inhalt. "✎" kennzeichnet manuell gepflegte Werte, "auto" kommt aus dem Titel.
 */
export default function InhaltZelle({ lexware, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('kg');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!lexware) return <span className="ui-table-sub">–</span>;
  const c = lexware.inhalt;

  const start = () => {
    setValue(c ? String(c.value).replace('.', ',') : '');
    setUnit(c ? c.unit : 'kg');
    setErr(''); setEditing(true);
  };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/finance/article-content/' + lexware.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim() === '' ? null : value, unit, articleNumber: lexware.nummer, name: lexware.name }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setEditing(false); onSaved(lexware.id, d.content);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (editing) return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="form-input" style={{ width: 80 }} value={value} onChange={(e) => setValue(e.target.value)} autoFocus placeholder="leer = entfernen"
        aria-label={`Inhalt ${lexware.nummer}`}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
      <select className="form-select" style={{ width: 'auto' }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Einheit">
        <option value="kg">kg</option><option value="L">L</option>
      </select>
      <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} aria-label="Speichern">✓</button>
      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} aria-label="Abbrechen">✕</button>
      {err && <span style={{ color: 'var(--err-fg)', fontSize: 12, width: '100%' }}>{err}</span>}
    </span>
  );

  const label = c
    ? <span>{zahl(c.value)} {c.unit}{c.source === 'manuell' && <span title="manuell gepflegt" style={{ color: 'var(--text3)' }}> ✎</span>}</span>
    : <Tag tone="warn">fehlt</Tag>;
  return canEdit
    ? <button onClick={start} title="Inhalt bearbeiten" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>{label}</button>
    : label;
}
