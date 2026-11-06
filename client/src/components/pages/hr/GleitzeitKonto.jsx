import { useState, useEffect, useCallback } from 'react';

/**
 * Gleitzeitkonto (#490) in der Zeiterfassung.
 *
 *   <GleitzeitKonto eigen jahr monat aktualisiert />              Meine Zeiterfassung (nur lesen)
 *   <GleitzeitKonto employeeId jahr monat aktualisiert />         Auswertung GF/Backoffice, mit Korrekturen
 *
 * `aktualisiert` ändert sich, wenn die Zeiterfassung neu geladen wurde (z. B. nach
 * einem Nachtrag) — dann wird auch das Konto neu geholt.
 * Ohne aktives Konto rendert die Komponente nichts.
 */

const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function formatMinuten(min, mitVorzeichen = true) {
  const vz = !mitVorzeichen ? '' : min > 0 ? '+' : min < 0 ? '−' : '';
  const abs = Math.abs(Math.round(min));
  return `${vz}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

// '-3:30', '-3,5', '2' -> Minuten; null wenn ungültig
function parseStunden(text) {
  const t = String(text).trim().replace('−', '-');
  const hm = t.match(/^([+-]?)(\d+):([0-5]\d)$/);
  if (hm) return (hm[1] === '-' ? -1 : 1) * (Number(hm[2]) * 60 + Number(hm[3]));
  if (!/^[+-]?\d+([.,]\d+)?$/.test(t)) return null;
  return Math.round(Number(t.replace(',', '.')) * 60);
}

const fmtDatum = (d) => (d ? new Date(d + 'T00:00').toLocaleDateString('de-DE') : '—');
const zeitraumLabel = (z, gruppe) => {
  if (gruppe === 'woche') return 'KW ' + Number(z.split('-W')[1]);
  return MONATE_KURZ[Number(z.slice(5, 7)) - 1];
};
const farbe = (min) => (min < 0 ? 'var(--red2)' : min > 0 ? 'var(--green)' : 'var(--text2)');

const S = {
  box: { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: '9px', padding: '16px', marginBottom: '18px' },
  titel: { fontSize: '13px', fontWeight: 700, color: 'var(--text1)' },
  klein: { fontSize: '11px', color: 'var(--text3)' },
  feld: {
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
    padding: '7px 9px', color: 'var(--text1)', fontSize: '12.5px',
  },
  knopf: (an) => ({
    background: 'var(--bg2)', border: '1px solid ' + (an ? 'var(--text1)' : 'var(--border)'),
    borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: 'var(--text1)',
    fontWeight: an ? 600 : 400, cursor: 'pointer',
  }),
  th: { textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: 'var(--text3)', fontSize: '11px' },
  td: { textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums' },
};

export default function GleitzeitKonto({ eigen = false, employeeId, jahr, monat, aktualisiert }) {
  const [gruppe, setGruppe] = useState('woche');
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [form, setForm] = useState({ datum: '', stunden: '', notiz: '' });
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState(null);

  const basis = eigen ? '/api/zeit/gleitzeit' : `/api/hr/zeiterfassung/mitarbeiter/${employeeId}/gleitzeit`;

  const laden = useCallback(async () => {
    if (!eigen && !employeeId) { setDaten(null); return; }
    try {
      const r = await fetch(`${basis}?jahr=${jahr}&monat=${monat}&gruppe=${gruppe}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler');
      setDaten(d); setFehler(null);
    } catch (e) { setFehler(e.message); setDaten(null); }
  }, [basis, eigen, employeeId, jahr, monat, gruppe]);

  useEffect(() => { laden(); }, [laden, aktualisiert]);

  if (fehler) return <div style={{ ...S.box, color: 'var(--red2)', fontSize: '12.5px' }}>Gleitzeitkonto: {fehler}</div>;
  if (!daten || !daten.aktiv && !daten.gebuchtBis) return null;

  const summe = daten.verlauf.reduce((s, v) => s + v.saldo, 0);
  const korrekturMinuten = parseStunden(form.stunden);

  const korrekturSenden = async (e) => {
    e.preventDefault();
    if (korrekturMinuten === null || korrekturMinuten === 0) { setMeldung({ ok: false, text: 'Stunden ungültig, z. B. +2:30 oder -1,5' }); return; }
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch(`${basis}/korrektur`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum: form.datum, minuten: korrekturMinuten, notiz: form.notiz }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehlgeschlagen');
      setMeldung({ ok: true, text: `Korrektur ${formatMinuten(korrekturMinuten)} h gebucht.` });
      setForm({ datum: '', stunden: '', notiz: '' });
      await laden();
    } catch (err) { setMeldung({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  const korrekturLoeschen = async (k) => {
    if (!window.confirm(`Korrektur ${formatMinuten(k.minuten)} h vom ${fmtDatum(k.datum)} löschen?`)) return;
    const r = await fetch(`${basis}/korrektur/${k.id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMeldung({ ok: false, text: d.error || 'Löschen fehlgeschlagen' }); return; }
    await laden();
  };

  return (
    <div style={S.box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={S.titel}>Gleitzeitkonto</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: farbe(daten.minuten), fontVariantNumeric: 'tabular-nums' }}>
            {formatMinuten(daten.minuten)} h
          </div>
          <div style={S.klein}>
            {daten.aktiv ? `gebucht bis ${fmtDatum(daten.gebuchtBis)} · heute zählt ab 20 Uhr` : 'Konto nicht mehr aktiv'}
            {daten.startsaldo ? ` · Startsaldo ${formatMinuten(daten.startsaldo)} h` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" style={S.knopf(gruppe === 'woche')} onClick={() => setGruppe('woche')}>Wochen im Monat</button>
          <button type="button" style={S.knopf(gruppe === 'monat')} onClick={() => setGruppe('monat')}>Monate {jahr}</button>
        </div>
      </div>

      {daten.verlauf.length === 0 ? (
        <div style={{ ...S.klein, marginTop: '12px' }}>Im gewählten Zeitraum keine Buchungen.</div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: 'var(--text1)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...S.th, textAlign: 'left' }}>{gruppe === 'woche' ? 'Woche' : 'Monat'}</th>
                <th style={S.th}>Soll</th>
                <th style={S.th}>Ist</th>
                <th style={S.th}>Abbau</th>
                <th style={S.th}>Korrektur</th>
                <th style={S.th}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {daten.verlauf.map((v) => (
                <tr key={v.zeitraum} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...S.td, textAlign: 'left' }}>{zeitraumLabel(v.zeitraum, gruppe)}</td>
                  <td style={S.td}>{formatMinuten(v.soll, false)}</td>
                  <td style={S.td}>{formatMinuten(v.ist, false)}</td>
                  <td style={S.td}>{v.abbau ? formatMinuten(v.abbau) : '—'}</td>
                  <td style={S.td}>{v.korrektur ? formatMinuten(v.korrektur) : '—'}</td>
                  <td style={{ ...S.td, fontWeight: 600, color: farbe(v.saldo) }}>{formatMinuten(v.saldo)}</td>
                </tr>
              ))}
              <tr>
                {/* Saldo des Zeitraums, nicht der Kontostand (der steht oben) */}
                <td style={{ ...S.td, textAlign: 'left', fontWeight: 600 }}>
                  Saldo {gruppe === 'woche' ? MONATE_LANG[monat - 1] : jahr}
                </td>
                <td colSpan={4} />
                <td style={{ ...S.td, fontWeight: 700, color: farbe(summe) }}>{formatMinuten(summe)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!eigen && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div style={{ ...S.titel, fontSize: '12.5px', marginBottom: '8px' }}>Korrekturbuchung</div>
          {daten.aktiv && (
            <form onSubmit={korrekturSenden} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...S.klein }}>
                Datum
                <input type="date" required value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} style={S.feld} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...S.klein }}>
                Stunden (±)
                <input required placeholder="+2:30 / -1,5" value={form.stunden} onChange={(e) => setForm({ ...form, stunden: e.target.value })}
                  style={{ ...S.feld, width: '100px', borderColor: form.stunden && korrekturMinuten === null ? 'var(--red2)' : 'var(--border)' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px', ...S.klein }}>
                Grund
                <input required maxLength={255} placeholder="z. B. Auszahlung Überstunden Oktober" value={form.notiz}
                  onChange={(e) => setForm({ ...form, notiz: e.target.value })} style={S.feld} />
              </label>
              <button type="submit" disabled={busy} style={{ ...S.knopf(false), padding: '8px 12px', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Bucht…' : 'Buchen'}
              </button>
            </form>
          )}
          {meldung && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: meldung.ok ? 'var(--text2)' : 'var(--red2)' }}>{meldung.text}</div>
          )}
          {daten.korrekturen?.length > 0 ? (
            <div style={{ marginTop: '10px' }}>
              {daten.korrekturen.map((k) => (
                <div key={k.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px', padding: '4px 0', color: 'var(--text2)' }}>
                  <span style={{ minWidth: '80px' }}>{fmtDatum(k.datum)}</span>
                  <strong style={{ minWidth: '60px', color: farbe(k.minuten), fontVariantNumeric: 'tabular-nums' }}>{formatMinuten(k.minuten)}</strong>
                  <span style={{ flex: 1 }}>{k.notiz}<span style={S.klein}> · {k.erfasst_von || 'unbekannt'}, {k.erfasst_am}</span></span>
                  <button type="button" onClick={() => korrekturLoeschen(k)} style={{ ...S.knopf(false), padding: '2px 8px' }}>Löschen</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...S.klein, marginTop: '8px' }}>Keine Korrekturen im gewählten Zeitraum.</div>
          )}
        </div>
      )}
    </div>
  );
}
