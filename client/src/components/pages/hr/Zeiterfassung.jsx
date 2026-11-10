import { useState, useEffect, useCallback } from 'react';
import GleitzeitKonto from './GleitzeitKonto';

/**
 * Zeiterfassung — Spiegel der Rentman-Daten, nur lesend.
 *
 * Zwei Einsatzarten:
 *   <Zeiterfassung />              Auswertung, mit Mitarbeiterauswahl (Bereich hr.zeitauswertung)
 *   <Zeiterfassung eigen />        eigene Zeiten, ohne Auswahl      (Bereich zeit.eigen)
 *
 * Alle Dauern kommen in Sekunden aus der API.
 */

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const hhmm = (sek) => {
  const s = Math.max(0, Math.round(Number(sek) || 0));
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
};

const urlaubMeldungText = (liste) => {
  if (!liste || !liste.length) return '';
  return ' ' + liste.map((u) => {
    if (u.fehler) return `Urlaub ab ${u.von}: Neuberechnung fehlgeschlagen (${u.fehler})`;
    const alt = u.altSekunden != null ? hhmm(u.altSekunden) : '?';
    return `Urlaub ab ${u.von} neu berechnet: ${alt} → ${hhmm(u.neuSekunden)} pro Tag`;
  }).join(' · ');
};

const datum = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

const feld = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
  padding: '8px 10px', color: 'var(--text1)', fontSize: '13px', cursor: 'pointer',
};

const th = {
  padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em',
};

const td = { padding: '11px 14px', fontSize: '13px', color: 'var(--text2)' };

/**
 * Urlaubsabgleich mit Rentman.
 *
 * Zeigt Urlaube, die noch nicht sauber in Rentman stehen: entweder nie
 * uebertragen (dann fehlen die Stunden komplett) oder noch mit einem
 * vorlaeufigen Wert, obwohl der Urlaub schon begonnen hat. Normalerweise
 * erledigt das der naechtliche Job um 03:00 — diese Liste macht sichtbar,
 * wenn er es nicht getan hat.
 */
function UrlaubsAbgleich() {
  const [zeilen, setZeilen] = useState(null);
  const [laeuft, setLaeuft] = useState(null);
  const [meldung, setMeldung] = useState(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/hr/zeiterfassung/urlaub-abgleich');
      const d = await r.json();
      setZeilen(Array.isArray(d) ? d : []);
    } catch {
      setZeilen([]);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const neuBerechnen = async (z) => {
    const alt = z.stunden_sekunden ? hhmm(z.stunden_sekunden) : 'noch nichts';
    const warnung = z.vergangen
      ? '\n\nAchtung: Dieser Urlaub liegt in der Vergangenheit. Ist der Monat '
        + 'bereits abgerechnet, aenderst du damit einen ausgezahlten Betrag.'
      : '';
    const text = `${z.full_name}\nUrlaub ${z.von} bis ${z.bis}\n`
      + `Bisher angerechnet: ${alt} pro Tag\n\n`
      + `Der Wert wird aus den 13 Wochen vor dem ${z.von} neu berechnet `
      + `und nach Rentman geschrieben.${warnung}\n\nFortfahren?`;
    if (!window.confirm(text)) return;

    setLaeuft(z.id);
    setMeldung(null);
    try {
      const r = await fetch(`/api/hr/zeiterfassung/urlaub/${z.id}/neuberechnen`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehlgeschlagen');
      setMeldung({
        ok: true,
        text: `${z.full_name}: ${hhmm(d.schnitt)} pro Tag aus ${d.bemessung.tage} Arbeitstagen `
          + `(${d.bemessung.von} bis ${d.bemessung.bis}), Rentman-Antrag ${d.leaverequestId}`
          + (d.vorlaeufig ? ' — bleibt vorlaeufig, endgueltig am ersten Urlaubstag' : ''),
      });
      await laden();
    } catch (e) {
      setMeldung({ ok: false, text: e.message });
    } finally {
      setLaeuft(null);
    }
  };

  if (zeilen === null) return null;

  return (
    <div style={{ marginTop: '34px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text1)', margin: '0 0 4px' }}>
        Urlaubsabgleich mit Rentman
      </h2>
      <p style={{ fontSize: '12.5px', color: 'var(--text3)', margin: '0 0 14px' }}>
        Urlaubstage werden mit dem Durchschnitt der 13 Wochen vor Urlaubsbeginn vergütet.
        Der Wert wird am ersten Urlaubstag automatisch endgültig gesetzt. Hier stehen die Fälle,
        bei denen das noch aussteht.
      </p>

      {meldung && (
        <div style={{
          background: 'var(--bg2)', borderRadius: '7px', padding: '11px 13px',
          marginBottom: '14px', fontSize: '12.5px',
          border: '1px solid ' + (meldung.ok ? 'var(--border)' : 'var(--red2)'),
          color: meldung.ok ? 'var(--text2)' : 'var(--red2)',
        }}>{meldung.text}</div>
      )}

      {zeilen.length === 0 ? (
        <div style={{
          background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: '9px',
          padding: '18px', fontSize: '13px', color: 'var(--text3)',
        }}>
          Alles abgeglichen — kein Urlaub wartet auf eine Berechnung.
        </div>
      ) : (
        <div style={{
          background: 'var(--bg1)', border: '1px solid var(--border)',
          borderRadius: '9px', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Mitarbeiter</th>
                <th style={th}>Zeitraum</th>
                <th style={{ ...th, textAlign: 'right' }}>angerechnet</th>
                <th style={th}>Grund</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={z.id} style={{
                  borderBottom: i < zeilen.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <td style={{ ...td, color: 'var(--text1)', fontWeight: 600 }}>{z.full_name}</td>
                  <td style={td}>
                    {z.von} – {z.bis}
                    {z.vergangen && (
                      <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '7px' }}>
                        vergangen
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {z.stunden_sekunden ? hhmm(z.stunden_sekunden) : '—'}
                  </td>
                  <td style={td}>
                    <span style={{
                      background: 'var(--bg3)', borderRadius: '5px', padding: '3px 8px', fontSize: '12px',
                    }}>{z.grund}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button
                      onClick={() => neuBerechnen(z)}
                      disabled={laeuft === z.id}
                      style={{
                        background: 'var(--bg2)', border: '1px solid var(--border)',
                        borderRadius: '6px', padding: '6px 11px', fontSize: '12.5px',
                        color: 'var(--text1)', cursor: laeuft === z.id ? 'default' : 'pointer',
                        opacity: laeuft === z.id ? 0.6 : 1,
                      }}>
                      {laeuft === z.id ? 'rechnet…' : 'Neu berechnen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Zeiterfassung({ eigen = false }) {
  const heute = new Date();
  const [jahr, setJahr] = useState(heute.getFullYear());
  const [monat, setMonat] = useState(heute.getMonth() + 1);
  const [mitarbeiter, setMitarbeiter] = useState([]);
  const [empId, setEmpId] = useState('');
  const [daten, setDaten] = useState(null);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [manuellOffen, setManuellOffen] = useState(false);
  const [manuellForm, setManuellForm] = useState({ tag: '', start: '', ende: '', pauseMinuten: '' });
  // Profil: "Automatisch 30 Minuten Pause buchen" -> Pausenfeld vorbefüllt
  const [autoPause, setAutoPause] = useState(false);
  useEffect(() => {
    fetch('/api/profile').then(r => (r.ok ? r.json() : null)).then(pf => {
      if (!pf || !Number(pf.auto_pause_30)) return;
      setAutoPause(true);
      setManuellForm(f => (f.pauseMinuten === '' ? { ...f, pauseMinuten: '30' } : f));
    }).catch(() => {});
  }, []);
  const [manuellBusy, setManuellBusy] = useState(false);
  const [manuellMeldung, setManuellMeldung] = useState(null);
  const [fremdOffen, setFremdOffen] = useState(false);
  const [fremdTyp, setFremdTyp] = useState('arbeitszeit');
  const [fremdForm, setFremdForm] = useState({ tag: '', start: '', ende: '', pauseMinuten: '', stunden: '' });
  const [fremdBusy, setFremdBusy] = useState(false);
  const [fremdMeldung, setFremdMeldung] = useState(null);
  const [bearbeitenId, setBearbeitenId] = useState(null);
  const [bearbeitenForm, setBearbeitenForm] = useState({ tag: '', start: '', ende: '', pauseMinuten: '' });
  const [bearbeitenBusy, setBearbeitenBusy] = useState(false);
  const [bearbeitenMeldung, setBearbeitenMeldung] = useState(null);

  // Mitarbeiterliste nur für die Auswertung
  useEffect(() => {
    if (eigen) return;
    fetch('/api/hr/zeiterfassung/mitarbeiter')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setMitarbeiter(d);
      })
      .catch(() => {});
  }, [eigen]);

  const laden_ = useCallback(async () => {
    if (!eigen && !empId) { setDaten(null); return; }
    setLaden(true);
    setFehler(null);
    try {
      const url = eigen
        ? `/api/zeit?jahr=${jahr}&monat=${monat}`
        : `/api/hr/zeiterfassung?employee_id=${empId}&jahr=${jahr}&monat=${monat}`;
      const res = await fetch(url);
      const d = await res.json();
      if (!res.ok) {
        setFehler(d.hinweis ? `${d.error} — ${d.hinweis}` : (d.error || 'Unbekannter Fehler'));
        setDaten(null);
      } else {
        setDaten(d);
      }
    } catch (e) {
      setFehler(e.message);
      setDaten(null);
    } finally {
      setLaden(false);
    }
  }, [eigen, empId, jahr, monat]);

  useEffect(() => { laden_(); }, [laden_]);

  const manuellSenden = async (e) => {
    e.preventDefault();
    setManuellBusy(true);
    setManuellMeldung(null);
    try {
      const start = `${manuellForm.tag}T${manuellForm.start}:00`;
      const ende = `${manuellForm.tag}T${manuellForm.ende}:00`;
      const res = await fetch('/api/zeit/manuell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: manuellForm.tag, start, ende,
          pauseMinuten: Number(manuellForm.pauseMinuten || 0),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen');
      setManuellMeldung({ ok: true, text: 'Eintrag gespeichert.' });
      setManuellForm({ tag: '', start: '', ende: '', pauseMinuten: autoPause ? '30' : '' });
      setManuellOffen(false);
      await laden_();
    } catch (err) {
      setManuellMeldung({ ok: false, text: err.message });
    } finally {
      setManuellBusy(false);
    }
  };

  const fremdSenden = async (e) => {
    e.preventDefault();
    setFremdBusy(true);
    setFremdMeldung(null);
    try {
      const body = fremdTyp === 'krankheit'
        ? { tag: fremdForm.tag, typ: 'krankheit', stunden: Number(fremdForm.stunden || 0) }
        : {
            tag: fremdForm.tag,
            start: `${fremdForm.tag}T${fremdForm.start}:00`,
            ende: `${fremdForm.tag}T${fremdForm.ende}:00`,
            pauseMinuten: Number(fremdForm.pauseMinuten || 0),
          };
      const res = await fetch(`/api/hr/zeiterfassung/mitarbeiter/${empId}/zeit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.hinweis ? `${d.error} — ${d.hinweis}` : (d.error || 'Fehlgeschlagen'));
      setFremdMeldung({ ok: true, text: 'Eintrag gespeichert.' + urlaubMeldungText(d.urlaubNeuberechnet) });
      setFremdForm({ tag: '', start: '', ende: '', pauseMinuten: '', stunden: '' });
      setFremdOffen(false);
      await laden_();
    } catch (err) {
      setFremdMeldung({ ok: false, text: err.message });
    } finally {
      setFremdBusy(false);
    }
  };

  const bearbeitenOeffnen = async (e) => {
    setBearbeitenMeldung(null);
    try {
      const res = await fetch(`/api/hr/zeiterfassung/zeit/${e.zeitEintragId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen');
      setBearbeitenId(e.zeitEintragId);
      setBearbeitenForm({
        tag: d.start.slice(0, 10),
        start: d.start.slice(11, 16),
        ende: d.ende ? d.ende.slice(11, 16) : '',
        pauseMinuten: String(d.pauseMinuten),
      });
    } catch (err) {
      setBearbeitenMeldung({ ok: false, text: err.message });
    }
  };

  const bearbeitenSenden = async (e) => {
    e.preventDefault();
    setBearbeitenBusy(true);
    setBearbeitenMeldung(null);
    try {
      const start = `${bearbeitenForm.tag}T${bearbeitenForm.start}:00`;
      const ende = `${bearbeitenForm.tag}T${bearbeitenForm.ende}:00`;
      const res = await fetch(`/api/hr/zeiterfassung/zeit/${bearbeitenId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, ende, pauseMinuten: Number(bearbeitenForm.pauseMinuten || 0) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen');
      setBearbeitenId(null);
      setBearbeitenMeldung({ ok: true, text: 'Eintrag korrigiert.' + urlaubMeldungText(d.urlaubNeuberechnet) });
      await laden_();
    } catch (err) {
      setBearbeitenMeldung({ ok: false, text: err.message });
    } finally {
      setBearbeitenBusy(false);
    }
  };

  const jahre = [];
  for (let j = heute.getFullYear() + 1; j >= heute.getFullYear() - 4; j--) jahre.push(j);

  return (
    <div style={{ padding: '22px 26px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text1)', margin: '0 0 4px' }}>
        {eigen ? 'Meine Zeiterfassung' : 'Zeiterfassung (Auswertung)'}
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text3)', margin: '0 0 20px' }}>
        {daten?.mitarbeiter?.zeiterfassung_quelle && daten.mitarbeiter.zeiterfassung_quelle !== 'portal'
          ? 'Erfasst in Rentman, ins Portal übernommen.'
          : 'Erfasst im Portal, Rentman wird nur noch als Kopie mitgeführt.'}
        {' '}Pausen sind in der Zeit bereits abgezogen.
      </p>

      {/* Auswahl */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {!eigen && (
          <select value={empId} onChange={e => setEmpId(e.target.value)} style={{ ...feld, minWidth: '220px' }}>
            <option value="">— Mitarbeiter wählen —</option>
            {mitarbeiter.map(m => (
              <option key={m.id} value={m.id}>{m.name}{m.active ? '' : ' (inaktiv)'}</option>
            ))}
          </select>
        )}
        <select value={monat} onChange={e => setMonat(Number(e.target.value))} style={{ ...feld, minWidth: '140px' }}>
          {MONATE.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={jahr} onChange={e => setJahr(Number(e.target.value))} style={{ ...feld, minWidth: '100px' }}>
          {jahre.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>

      {eigen && (
        <div style={{ marginBottom: '18px' }}>
          <button
            onClick={() => setManuellOffen(v => !v)}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '7px 12px', fontSize: '12.5px',
              color: 'var(--text1)', cursor: 'pointer',
            }}>
            {manuellOffen ? 'Manuelle Erfassung schließen' : '+ Zeit manuell nachtragen'}
          </button>

          {manuellOffen && (
            <form onSubmit={manuellSenden} style={{
              display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end',
              marginTop: '12px', background: 'var(--bg1)', border: '1px solid var(--border)',
              borderRadius: '9px', padding: '16px',
            }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                Tag
                <input type="date" required max={new Date().toISOString().slice(0, 10)}
                  value={manuellForm.tag}
                  onChange={e => setManuellForm({ ...manuellForm, tag: e.target.value })}
                  style={{ ...feld, cursor: 'text' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                Start
                <input type="time" required
                  value={manuellForm.start}
                  onChange={e => setManuellForm({ ...manuellForm, start: e.target.value })}
                  style={{ ...feld, cursor: 'text' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                Ende
                <input type="time" required
                  value={manuellForm.ende}
                  onChange={e => setManuellForm({ ...manuellForm, ende: e.target.value })}
                  style={{ ...feld, cursor: 'text' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                Pause (Minuten)
                <input type="number" min="0" step="5"
                  value={manuellForm.pauseMinuten}
                  onChange={e => setManuellForm({ ...manuellForm, pauseMinuten: e.target.value })}
                  style={{ ...feld, cursor: 'text', width: '90px' }} />
              </label>
              <button type="submit" disabled={manuellBusy} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '9px 14px', fontSize: '13px',
                color: 'var(--text1)', cursor: manuellBusy ? 'default' : 'pointer',
                opacity: manuellBusy ? 0.6 : 1,
              }}>
                {manuellBusy ? 'Speichert…' : 'Speichern'}
              </button>
            </form>
          )}

          {manuellMeldung && (
            <div style={{
              marginTop: '10px', background: 'var(--bg2)', borderRadius: '7px', padding: '10px 13px',
              fontSize: '12.5px', border: '1px solid ' + (manuellMeldung.ok ? 'var(--border)' : 'var(--red2)'),
              color: manuellMeldung.ok ? 'var(--text2)' : 'var(--red2)',
            }}>{manuellMeldung.text}</div>
          )}
        </div>
      )}

      {!eigen && empId && (
        <div style={{ marginBottom: '18px' }}>
          <button
            onClick={() => setFremdOffen(v => !v)}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '7px 12px', fontSize: '12.5px',
              color: 'var(--text1)', cursor: 'pointer',
            }}>
            {fremdOffen ? 'Fremderfassung schließen' : '+ Zeit für Mitarbeiter erfassen'}
          </button>

          {fremdOffen && (
            <form onSubmit={fremdSenden} style={{
              display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end',
              marginTop: '12px', background: 'var(--bg1)', border: '1px solid var(--border)',
              borderRadius: '9px', padding: '16px',
            }}>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button type="button" onClick={() => setFremdTyp('arbeitszeit')} style={{
                  background: 'var(--bg2)', border: '1px solid ' + (fremdTyp === 'arbeitszeit' ? 'var(--text1)' : 'var(--border)'),
                  borderRadius: '6px', padding: '6px 12px', fontSize: '12.5px',
                  color: 'var(--text1)', fontWeight: fremdTyp === 'arbeitszeit' ? 600 : 400, cursor: 'pointer',
                }}>Arbeitszeit</button>
                <button type="button" onClick={() => setFremdTyp('krankheit')} style={{
                  background: 'var(--bg2)', border: '1px solid ' + (fremdTyp === 'krankheit' ? 'var(--text1)' : 'var(--border)'),
                  borderRadius: '6px', padding: '6px 12px', fontSize: '12.5px',
                  color: 'var(--text1)', fontWeight: fremdTyp === 'krankheit' ? 600 : 400, cursor: 'pointer',
                }}>Krankentag</button>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                Tag
                <input type="date" required max={new Date().toISOString().slice(0, 10)}
                  value={fremdForm.tag}
                  onChange={e => setFremdForm({ ...fremdForm, tag: e.target.value })}
                  style={{ ...feld, cursor: 'text' }} />
              </label>
              {fremdTyp === 'krankheit' ? (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                  Stunden
                  <input type="number" required min="0.5" max="24" step="0.5"
                    value={fremdForm.stunden}
                    onChange={e => setFremdForm({ ...fremdForm, stunden: e.target.value })}
                    style={{ ...feld, cursor: 'text', width: '90px' }} />
                </label>
              ) : (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                    Start
                    <input type="time" required
                      value={fremdForm.start}
                      onChange={e => setFremdForm({ ...fremdForm, start: e.target.value })}
                      style={{ ...feld, cursor: 'text' }} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                    Ende
                    <input type="time" required
                      value={fremdForm.ende}
                      onChange={e => setFremdForm({ ...fremdForm, ende: e.target.value })}
                      style={{ ...feld, cursor: 'text' }} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
                    Pause (Minuten)
                    <input type="number" min="0" step="5"
                      value={fremdForm.pauseMinuten}
                      onChange={e => setFremdForm({ ...fremdForm, pauseMinuten: e.target.value })}
                      style={{ ...feld, cursor: 'text', width: '90px' }} />
                  </label>
                </>
              )}
              <button type="submit" disabled={fremdBusy} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '9px 14px', fontSize: '13px',
                color: 'var(--text1)', cursor: fremdBusy ? 'default' : 'pointer',
                opacity: fremdBusy ? 0.6 : 1,
              }}>
                {fremdBusy ? 'Speichert…' : 'Speichern'}
              </button>
            </form>
          )}

          {fremdMeldung && (
            <div style={{
              marginTop: '10px', background: 'var(--bg2)', borderRadius: '7px', padding: '10px 13px',
              fontSize: '12.5px', border: '1px solid ' + (fremdMeldung.ok ? 'var(--border)' : 'var(--red2)'),
              color: fremdMeldung.ok ? 'var(--text2)' : 'var(--red2)',
            }}>{fremdMeldung.text}</div>
          )}
        </div>
      )}

      {fehler && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--red2)', borderRadius: '7px',
          padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: 'var(--red2)',
        }}>{fehler}</div>
      )}

      {/* Gleitzeitkonto (#490) — erscheint nur, wenn für den Mitarbeiter eines aktiv ist */}
      {(eigen || empId) && (
        <GleitzeitKonto eigen={eigen} employeeId={empId} jahr={jahr} monat={monat} aktualisiert={daten} />
      )}

      {!eigen && !empId && !fehler && (
        <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '30px 0' }}>
          Bitte oben einen Mitarbeiter wählen.
        </div>
      )}

      {laden && (
        <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '30px 0' }}>Lade…</div>
      )}

      {!laden && daten && (
        <div style={{
          background: 'var(--bg1)', border: '1px solid var(--border)',
          borderRadius: '9px', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Von</th>
                <th style={th}>Bis</th>
                <th style={{ ...th, textAlign: 'right' }}>Arbeitszeit</th>
                <th style={{ ...th, textAlign: 'right' }}>Pause</th>
                <th style={{ ...th, textAlign: 'right' }}>Gesamtzeit</th>
                <th style={{ ...th, textAlign: 'right' }}>davon Aktivitäten</th>
                <th style={th}>Art</th>
              </tr>
            </thead>
            <tbody>
              {daten.eintraege.length === 0 && (
                <tr><td style={{ ...td, padding: '24px 14px', color: 'var(--text3)' }} colSpan={7}>
                  Keine Einträge in diesem Monat.
                </td></tr>
              )}
              {daten.eintraege.map((e, i) => {
                const bearbeitet = !eigen && bearbeitenId === e.zeitEintragId;
                return (
                <tr key={e.id} style={{
                  borderBottom: i < daten.eintraege.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: e.zaehlt === false ? 0.55 : 1,
                  background: bearbeitet ? 'var(--bg2)' : 'transparent',
                }}>
                  <td style={td}>{datum(e.start)}</td>
                  <td style={td}>{datum(e.end)}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text1)', fontWeight: 600 }}>
                    {hhmm(e.dauer)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {e.pause ? hhmm(e.pause) : <span style={{ color: 'var(--text3)' }}>—</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {hhmm((e.dauer || 0) + (e.pause || 0))}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {e.aktivitaeten > 0 ? (
                      <span title={e.aktivitaetenDetails.map(a => `${a.beschreibung || 'Aktivität'}: ${hhmm(a.dauer)}`).join('\n')}>
                        {hhmm(e.aktivitaeten)}
                      </span>
                    ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                  </td>
                  <td style={td}>
                    {bearbeitet ? (
                      <form onSubmit={bearbeitenSenden} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        <input type="time" required value={bearbeitenForm.start}
                          onChange={ev => setBearbeitenForm({ ...bearbeitenForm, start: ev.target.value })}
                          style={{ ...feld, cursor: 'text', width: '80px', padding: '4px 6px', fontSize: '12px' }} />
                        <span style={{ color: 'var(--text3)', fontSize: '11px' }}>-</span>
                        <input type="time" required value={bearbeitenForm.ende}
                          onChange={ev => setBearbeitenForm({ ...bearbeitenForm, ende: ev.target.value })}
                          style={{ ...feld, cursor: 'text', width: '80px', padding: '4px 6px', fontSize: '12px' }} />
                        <input type="number" min="0" step="5" value={bearbeitenForm.pauseMinuten}
                          onChange={ev => setBearbeitenForm({ ...bearbeitenForm, pauseMinuten: ev.target.value })}
                          style={{ ...feld, cursor: 'text', width: '46px', padding: '4px 6px', fontSize: '12px' }}
                          title="Pause in Minuten" />
                        <button type="submit" disabled={bearbeitenBusy} style={{
                          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
                          padding: '4px 8px', fontSize: '11px', color: 'var(--text1)',
                          cursor: bearbeitenBusy ? 'default' : 'pointer',
                        }}>
                          {bearbeitenBusy ? '...' : 'OK'}
                        </button>
                        <button type="button" onClick={() => setBearbeitenId(null)} style={{
                          background: 'none', border: 'none', color: 'var(--text3)',
                          fontSize: '11px', cursor: 'pointer',
                        }}>
                          Abbrechen
                        </button>
                      </form>
                    ) : (
                      <>
                        <span style={{
                          background: 'var(--bg3)', borderRadius: '5px', padding: '3px 8px', fontSize: '12px',
                        }}>{e.typ || (e.quelle === 'portal' ? 'Gearbeitet' : '—')}</span>
                        {!e.zaehlt && e.zaehlt !== undefined && (
                          <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '7px' }}>
                            zählt nicht
                          </span>
                        )}
                        {!eigen && e.zeitEintragId && (
                          <button onClick={() => bearbeitenOeffnen(e)} style={{
                            marginLeft: '8px', background: 'none', border: 'none',
                            color: 'var(--text3)', fontSize: '11px', cursor: 'pointer',
                            textDecoration: 'underline',
                          }}>
                            Bearbeiten
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
                <td style={{ ...td, fontWeight: 700, color: 'var(--text1)' }} colSpan={2}>
                  Gesamt {MONATE[daten.monat - 1]} {daten.jahr}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>
                  {hhmm(daten.summe)}
                </td>
                <td style={td} />
                <td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>
                  {hhmm(daten.aktivitaetenSumme)}
                </td>
                <td style={td} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!laden && daten && (
        <p style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '12px' }}>
          In die Summe zählen: Gearbeitet, Urlaub, Korrektur und Krankheitstage.
          Kompensation und Feiertag werden angezeigt, aber nicht mitgerechnet.
          Die Aktivitätenzeit ist in der registrierten Zeit bereits enthalten.
        </p>
      )}

      {bearbeitenMeldung && (
        <div style={{
          marginTop: '12px', background: 'var(--bg2)', borderRadius: '7px', padding: '10px 13px',
          fontSize: '12.5px', border: '1px solid ' + (bearbeitenMeldung.ok ? 'var(--border)' : 'var(--red2)'),
          color: bearbeitenMeldung.ok ? 'var(--text2)' : 'var(--red2)',
        }}>{bearbeitenMeldung.text}</div>
      )}

      {!eigen && <UrlaubsAbgleich />}
    </div>
  );
}
