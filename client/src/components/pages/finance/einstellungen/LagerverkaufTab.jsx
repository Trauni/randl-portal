import { useState, useEffect, useCallback } from 'react';
import { Panel, Tag } from '../../../ui';

// #516 Lagerverkauf: Sonder-PIN fürs Storno (eine für alle Lager-Tablets) und Sammelmail an die Buchhaltung.
// Konzept #513 Abschnitt 11 im Repo dr-ser-abloese.

const api = async (url, methode = 'GET', body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

const zeit = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');

export default function LagerverkaufTab() {
  const [stand, setStand] = useState(null);
  const [pin, setPin] = useState(null);
  const [mail, setMail] = useState({ an: '', uhrzeit: '18:00', aktiv: false });
  const [fehler, setFehler] = useState('');
  const [gespeichert, setGespeichert] = useState(false);
  const [test, setTest] = useState(null);
  const [testTag, setTestTag] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()));

  const uebernehmen = (s) => { setStand(s); setMail({ an: s.sammelmail.an.join(', '), uhrzeit: s.sammelmail.uhrzeit, aktiv: s.sammelmail.aktiv }); };
  const laden = useCallback(async () => {
    try { uebernehmen(await api('/api/fahrer-lager')); } catch (e) { setFehler(e.message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const pinErzeugen = async () => {
    if (stand.pin.gesetzt && !window.confirm('Neue Sonder-PIN erzeugen? Die alte gilt auf den Lager-Tablets nur noch, bis sie die Stammdaten neu laden.')) return;
    setFehler('');
    try { setPin(await api('/api/fahrer-lager/pin', 'POST')); await laden(); } catch (e) { setFehler(e.message); }
  };
  const mailSpeichern = async () => {
    setFehler(''); setGespeichert(false);
    try { uebernehmen(await api('/api/fahrer-lager/sammelmail', 'PUT', { an: mail.an, uhrzeit: mail.uhrzeit, aktiv: mail.aktiv })); setGespeichert(true); } catch (e) { setFehler(e.message); }
  };
  const testSenden = async () => {
    setFehler(''); setTest({ laeuft: true });
    try { setTest(await api('/api/fahrer-lager/sammelmail/senden', 'POST', { tag: testTag })); } catch (e) { setTest(null); setFehler(e.message); }
  };

  if (!stand) return <div style={{ color: 'var(--text3)', padding: 20 }}>{fehler || 'Lade …'}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--text2)', maxWidth: 760 }}>
        Am Lager-Tablet gibt es Barverkauf und Lieferschein. Ein Barverkauf lässt sich nur am selben Tag und nur mit der Sonder-PIN stornieren.
        Die Lager-Tablets selbst werden unter „Geräte“ angelegt (Rolle „Lager-Tablet“).
      </p>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}

      <Panel title="Sonder-PIN fürs Storno">
        <div className="ui-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 15 }}>
            {stand.pin.gesetzt
              ? <><Tag tone="ok">eingerichtet</Tag><span style={{ color: 'var(--text2)' }}>am {zeit(stand.pin.gesetztAm)}{stand.pin.gesetztVon ? ` von ${stand.pin.gesetztVon}` : ''}</span></>
              : <><Tag tone="warn">noch keine PIN</Tag><span style={{ color: 'var(--text2)' }}>Ohne PIN kann am Lager niemand stornieren.</span></>}
          </div>
          {pin && (
            <div className="alert alert-info" role="status" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Mono, ui-monospace, monospace', fontSize: 36, fontWeight: 700, letterSpacing: '.15em' }}>{pin.pin}</span>
              <span style={{ flex: 1, minWidth: 220 }}>
                Nur jetzt sichtbar, das Portal speichert sie nicht im Klartext. Weitergeben nur an Klaus und Herrn Randl, nicht in Dateien, OpenProject oder BookStack.
                Die Tablets kennen sie nach „Stammdaten neu laden“.
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPin(null)}>Ausblenden</button>
            </div>
          )}
          <div><button className="btn btn-primary" onClick={pinErzeugen}>{stand.pin.gesetzt ? 'Neue PIN erzeugen' : 'PIN erzeugen'}</button></div>
        </div>
      </Panel>

      <Panel title="Sammelmail an die Buchhaltung">
        <div className="ui-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)' }}>
            Einmal am Tag ab der Uhrzeit: alle Belege der Lager-Tablets als PDF und eine Liste der Barverkäufe und Stornos mit Summe als Vorlage fürs Kassenbuch.
            Ohne Belege an dem Tag geht keine Mail raus. Versand über das Mailkonto des Shops, wie die Info-Mail.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 3fr) minmax(120px, 1fr) auto', gap: 12, alignItems: 'end' }}>
            <label style={lab}>Empfänger (mehrere mit Komma trennen)
              <input className="form-input" type="text" inputMode="email" placeholder="buchhaltung@…" value={mail.an} onChange={(e) => { setMail((m) => ({ ...m, an: e.target.value })); setGespeichert(false); }} />
            </label>
            <label style={lab}>Uhrzeit
              <input className="form-input" type="time" value={mail.uhrzeit} onChange={(e) => { setMail((m) => ({ ...m, uhrzeit: e.target.value })); setGespeichert(false); }} />
            </label>
            <button className="btn btn-primary" onClick={mailSpeichern}>Speichern</button>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
            <input type="checkbox" checked={mail.aktiv} onChange={(e) => { setMail((m) => ({ ...m, aktiv: e.target.checked })); setGespeichert(false); }} style={{ width: 20, height: 20 }} />
            Täglich automatisch verschicken
            {stand.sammelmail.aktiv ? <Tag tone="ok">eingeschaltet</Tag> : <Tag tone="warn">ausgeschaltet</Tag>}
            {gespeichert && <Tag tone="ok">gespeichert</Tag>}
          </label>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            {stand.sammelmail.letzte
              ? (stand.sammelmail.letzte.uebersprungen
                ? <>Zuletzt geprüft für den {stand.sammelmail.letzte.tag.split('-').reverse().join('.')}: keine Belege, keine Mail.</>
                : <>Zuletzt verschickt am {zeit(stand.sammelmail.letzte.zeit)} ({stand.sammelmail.letzte.anzahl} Belege an {stand.sammelmail.letzte.an.join(', ')}).</>)
              : <>Noch keine Sammelmail verschickt.</>}
            {stand.sammelmail.fehler && <div style={{ color: 'var(--red, #b00)', marginTop: 4 }}>Letzter Versuch {zeit(stand.sammelmail.fehler.zeit)} fehlgeschlagen: {stand.sammelmail.fehler.meldung}. Neuer Versuch nach 30 Minuten.</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border, rgba(0,0,0,.1))', paddingTop: 12 }}>
            <label style={{ ...lab, flexDirection: 'row', alignItems: 'center', gap: 8 }}>Tag
              <input className="form-input" type="date" value={testTag} onChange={(e) => { setTestTag(e.target.value); setTest(null); }} style={{ width: 170 }} />
            </label>
            <a className="btn btn-secondary" href={`/api/fahrer-lager/sammelmail/pdf?tag=${testTag}`} target="_blank" rel="noreferrer">PDF ansehen</a>
            <button className="btn btn-secondary" disabled={!stand.sammelmail.an.length || test?.laeuft} onClick={testSenden}>{test?.laeuft ? 'Sende …' : 'Jetzt testweise senden'}</button>
            {test && !test.laeuft && (test.gesendet
              ? <Tag tone="ok">an {test.an.join(', ')} gesendet ({test.anzahl} Belege)</Tag>
              : <Tag tone="warn">{test.grund}</Tag>)}
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>Der Test geht an die gespeicherten Empfänger, Betreff mit „[Test]“, und zählt nicht als Tagesversand.</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

const lab = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: 'var(--text2)' };
