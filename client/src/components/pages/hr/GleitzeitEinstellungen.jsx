import { useState, useEffect, useCallback } from 'react';

// Gleitzeitkonto (#490) — Abschnitt im Mitarbeiter-Dialog, speichert eigenständig.
// Nur GF (hr.mitarbeiter): Arbeitszeitvereinbarung zählt zu den Personalstammdaten.

const WOCHENTAGE = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
const TAG_KURZ = Object.fromEntries(WOCHENTAGE);

const heute = () => new Date().toLocaleDateString('sv-SE');
const fmtDatum = (d) => (d ? new Date(d + 'T00:00').toLocaleDateString('de-DE') : '—');
const fmtStunden = (n) => String(n).replace('.', ',');

export function formatMinuten(min) {
  const vz = min > 0 ? '+' : min < 0 ? '−' : '';
  const abs = Math.abs(Math.round(min));
  return `${vz}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

// '-3:30', '-3,5', '12' -> Minuten; null wenn ungültig
function parseStunden(text) {
  const t = String(text).trim().replace('−', '-');
  if (t === '') return 0;
  const hm = t.match(/^([+-]?)(\d+):([0-5]\d)$/);
  if (hm) return (hm[1] === '-' ? -1 : 1) * (Number(hm[2]) * 60 + Number(hm[3]));
  const dez = Number(t.replace(',', '.'));
  return Number.isFinite(dez) ? Math.round(dez * 60) : null;
}

const S = {
  titel: {
    fontSize: '11px', fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px',
  },
  label: { display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '5px' },
  input: {
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
    padding: '8px 10px', color: 'var(--text1)', fontSize: '13px', boxSizing: 'border-box',
  },
  kachel: { background: 'var(--bg2)', borderRadius: '6px', padding: '8px 10px' },
  hinweis: { fontSize: '11px', color: 'var(--text3)', marginTop: '6px' },
  fehler: {
    background: 'var(--bg2)', border: '1px solid var(--red2)', borderRadius: '6px',
    padding: '8px 10px', margin: '8px 0', fontSize: '12px', color: 'var(--red2)',
  },
  knopf: (primaer, aus) => ({
    background: primaer ? 'var(--r)' : 'var(--bg2)', border: '1px solid ' + (primaer ? 'var(--r)' : 'var(--border)'),
    borderRadius: '6px', padding: '7px 12px', color: primaer ? '#fff' : 'var(--text2)',
    fontSize: '12px', fontWeight: 600, cursor: aus ? 'not-allowed' : 'pointer', opacity: aus ? 0.6 : 1,
  }),
};

export default function GleitzeitEinstellungen({ employeeId }) {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);

  // Konto-Formular
  const [aktiv, setAktiv] = useState(false);
  const [seit, setSeit] = useState('');
  const [saldoText, setSaldoText] = useState('0');

  // Neue Arbeitszeit
  const [abDatum, setAbDatum] = useState(heute());
  const [stdText, setStdText] = useState('40');
  const [tage, setTage] = useState([1, 2, 3, 4, 5]);

  const uebernehmen = (d) => {
    setDaten(d);
    setAktiv(d.einstellungen.aktiv);
    setSeit(d.einstellungen.seit || '');
    setSaldoText(formatMinuten(d.einstellungen.startsaldoMinuten).replace('+', '').replace('−', '-'));
    const aktuell = d.arbeitszeit[0];
    if (aktuell) { setStdText(fmtStunden(aktuell.wochenstunden)); setTage(aktuell.arbeitstage); }
  };

  const anfrage = useCallback(async (pfad = '', optionen = {}) => {
    setBusy(true); setFehler('');
    try {
      const r = await fetch(`/api/hr/gleitzeit/einstellungen/${employeeId}${pfad}`, {
        headers: { 'Content-Type': 'application/json' }, ...optionen,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Fehler');
      uebernehmen(d);
    } catch (e) { setFehler(e.message); } finally { setBusy(false); }
  }, [employeeId]);

  useEffect(() => { anfrage(); }, [anfrage]);

  if (!daten) {
    return <div style={{ marginBottom: '20px' }}><div style={S.titel}>Gleitzeitkonto</div>
      {fehler ? <div style={S.fehler}>{fehler}</div> : <div style={S.hinweis}>Lädt…</div>}</div>;
  }

  const portal = daten.einstellungen.zeiterfassungQuelle === 'portal';
  const saldo = parseStunden(saldoText);
  const std = Number(String(stdText).replace(',', '.'));
  const sollTag = tage.length && std > 0 ? Math.round((std * 60) / tage.length) : null;

  const kontoSpeichern = () => {
    if (saldo === null) { setFehler('Startsaldo ungültig, z. B. 12:30 oder -3,5'); return; }
    anfrage('', { method: 'PUT', body: JSON.stringify({ aktiv, seit: seit || null, startsaldoMinuten: saldo }) });
  };
  const arbeitszeitSpeichern = () => {
    anfrage('/arbeitszeit', { method: 'POST', body: JSON.stringify({ gueltigAb: abDatum, wochenstunden: std, arbeitstage: tage }) });
  };
  const arbeitszeitLoeschen = (ab) => {
    if (!window.confirm(`Arbeitszeit ab ${fmtDatum(ab)} löschen? Das Konto wird ab diesem Tag neu berechnet.`)) return;
    anfrage(`/arbeitszeit/${ab}`, { method: 'DELETE' });
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={S.titel}>Gleitzeitkonto</div>

      {!portal && (
        <div style={{ ...S.hinweis, marginTop: 0, marginBottom: '10px' }}>
          Zeiterfassung läuft noch über Rentman — das Konto lässt sich erst aktivieren,
          wenn der Mitarbeiter im Portal erfasst.
        </div>
      )}

      {/* Stand */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div style={S.kachel}>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Kontostand</div>
          <div style={{
            fontSize: '20px', fontWeight: 700,
            color: !daten.wirksam ? 'var(--text3)' : daten.stand.minuten < 0 ? 'var(--red2)' : 'var(--green)',
          }}>{daten.wirksam || daten.stand.minuten ? formatMinuten(daten.stand.minuten) : '—'} h</div>
        </div>
        <div style={S.kachel}>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Gebucht bis</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '4px' }}>
            {daten.wirksam ? fmtDatum(daten.stand.gebuchtBis) : 'Konto nicht aktiv'}
          </div>
        </div>
      </div>

      {/* Wochenarbeitszeit */}
      <label style={S.label}>Vereinbarte Arbeitszeit</label>
      {daten.arbeitszeit.length > 0 ? (
        <div style={{ marginBottom: '8px' }}>
          {daten.arbeitszeit.map((a, i) => (
            <div key={a.gueltigAb} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
              fontSize: '12px', color: i === 0 ? 'var(--text1)' : 'var(--text3)', padding: '4px 0',
            }}>
              <span>ab {fmtDatum(a.gueltigAb)}: <strong>{fmtStunden(a.wochenstunden)} h</strong> · {a.arbeitstage.map((t) => TAG_KURZ[t]).join(', ')}</span>
              <button type="button" disabled={busy} onClick={() => arbeitszeitLoeschen(a.gueltigAb)}
                style={{ ...S.knopf(false, busy), padding: '3px 8px', fontWeight: 400 }}>Löschen</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...S.hinweis, marginTop: 0, marginBottom: '8px' }}>Noch keine Arbeitszeit hinterlegt.</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginBottom: '6px' }}>
        <div>
          <label style={S.label}>Gültig ab</label>
          <input type="date" value={abDatum} onChange={(e) => setAbDatum(e.target.value)} style={{ ...S.input, width: '150px' }} />
        </div>
        <div>
          <label style={S.label}>Stunden / Woche</label>
          <input inputMode="decimal" value={stdText} onChange={(e) => setStdText(e.target.value)} style={{ ...S.input, width: '90px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
        {WOCHENTAGE.map(([n, kurz]) => {
          const an = tage.includes(n);
          return (
            <button key={n} type="button" onClick={() => setTage(an ? tage.filter((t) => t !== n) : [...tage, n])}
              style={{
                background: an ? 'var(--r)' : 'var(--bg2)', border: '1px solid ' + (an ? 'var(--r)' : 'var(--border)'),
                borderRadius: '6px', padding: '5px 9px', color: an ? '#fff' : 'var(--text2)', fontSize: '12px', cursor: 'pointer',
              }}>{kurz}</button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{ ...S.hinweis, marginTop: 0 }}>
          {sollTag !== null ? `Soll ${formatMinuten(sollTag).replace('+', '')} h pro Arbeitstag, Feiertage frei` : 'Stunden und Arbeitstage angeben'}
        </span>
        <button type="button" disabled={busy || sollTag === null} onClick={arbeitszeitSpeichern}
          style={S.knopf(false, busy || sollTag === null)}>Arbeitszeit speichern</button>
      </div>

      {/* Konto */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
        <div>
          <label style={S.label}>Aktiv seit</label>
          <input type="date" value={seit} onChange={(e) => setSeit(e.target.value)} style={{ ...S.input, width: '150px' }} />
        </div>
        <div>
          <label style={S.label}>Startsaldo (h)</label>
          <input value={saldoText} onChange={(e) => setSaldoText(e.target.value)} placeholder="z. B. 12:30 oder -3,5"
            style={{ ...S.input, width: '110px', borderColor: saldo === null ? 'var(--red2)' : 'var(--border)' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text1)', padding: '8px 0', cursor: portal ? 'pointer' : 'not-allowed' }}>
          <input type="checkbox" checked={aktiv} disabled={!portal && !aktiv} onChange={(e) => setAktiv(e.target.checked)} />
          Konto aktiv
        </label>
        {!portal && (
          <div style={{ ...S.hinweis, marginTop: 0, padding: '8px 0', color: 'var(--red2)' }}>
            Gesperrt: Die Zeiterfassung dieses Mitarbeiters läuft noch über Rentman, nicht über das Portal. Erst auf Portal umstellen lassen.
          </div>
        )}
      </div>
      <div style={S.hinweis}>
        Ab „Aktiv seit“ wird das Konto rückwirkend aus der Zeiterfassung berechnet.
        Der laufende Tag wird nach dem Tagesabschluss um 20 Uhr gebucht.
      </div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button type="button" disabled={busy} onClick={kontoSpeichern} style={S.knopf(true, busy)}>
          {busy ? 'Speichern…' : 'Gleitzeitkonto speichern'}
        </button>
      </div>
    </div>
  );
}
