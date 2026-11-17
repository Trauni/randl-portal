import { useState, useEffect, useCallback } from 'react';

// #514 Ladebasen für das ADR-Beförderungspapier der Fahrer-App. Eine Zeile Adresse, Deaktivieren statt Löschen.
const input = { background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.85rem', boxSizing:'border-box', width:'100%' };
const th = { textAlign:'left', padding:'.4rem .6rem', fontSize:'.68rem', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em' };
const td = { padding:'.4rem .6rem', fontSize:'.85rem', color:'var(--text1)' };
const knopf = { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .8rem', color:'var(--text1)', fontSize:'.85rem', cursor:'pointer' };

const api = async (url, methode, body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

export default function Ladebasen() {
  const [liste, setListe] = useState(null);
  const [neu, setNeu] = useState({ name: '', adresse: '' });
  const [bearbeite, setBearbeite] = useState(null);
  const [msg, setMsg] = useState(null);

  const laden = useCallback(async () => {
    try { setListe(await api('/api/fahrer-ladebasen', 'GET')); } catch (e) { setMsg({ fehler: e.message }); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const ausfuehren = async (fn) => {
    setMsg(null);
    try { await fn(); await laden(); } catch (e) { setMsg({ fehler: e.message }); }
  };

  const anlegen = () => ausfuehren(async () => {
    await api('/api/fahrer-ladebasen', 'POST', { name: neu.name, adresse: neu.adresse, sortierung: (liste?.length || 0) * 10 + 10 });
    setNeu({ name: '', adresse: '' });
  });
  const speichern = () => ausfuehren(async () => {
    await api(`/api/fahrer-ladebasen/${bearbeite.id}`, 'PATCH', { name: bearbeite.name, adresse: bearbeite.adresse });
    setBearbeite(null);
  });
  const umschalten = (b) => ausfuehren(() => api(`/api/fahrer-ladebasen/${b.id}`, 'PATCH', { aktiv: !b.aktiv }));

  if (!liste) return <div style={{ padding:'1.5rem', color:'var(--text2)' }}>{msg?.fehler || 'Lade …'}</div>;

  return (
    <div style={{ padding:'1.5rem', maxWidth:980 }}>
      <h1 style={{ fontSize:'1.2rem', color:'var(--text1)', marginBottom:'.25rem' }}>Ladebasen</h1>
      <p style={{ color:'var(--text2)', fontSize:'.85rem', marginBottom:'1.25rem' }}>
        Steht im Kopf des Beförderungspapiers („Ladebasis“) und kommt mit „Touren neu laden“ aufs Tablet. Adresse in einer Zeile, z. B. „Grünweg 1, 83370 Seeon“.
        Nicht mehr genutzte Ladebasen deaktivieren, nicht löschen.
      </p>
      {msg?.fehler && <div style={{ color:'var(--red, #e5484d)', fontSize:'.85rem', marginBottom:'.75rem' }}>{msg.fehler}</div>}

      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1rem', marginBottom:'1.25rem', display:'grid', gridTemplateColumns:'1fr 2fr auto', gap:'.75rem', alignItems:'end' }}>
        <input style={input} placeholder="Name, z. B. Obing" value={neu.name} onChange={(e) => setNeu((n) => ({ ...n, name:e.target.value }))} />
        <input style={input} placeholder="Adresse (optional, kann nachgetragen werden)" value={neu.adresse} onChange={(e) => setNeu((n) => ({ ...n, adresse:e.target.value }))} />
        <button style={knopf} disabled={!neu.name.trim()} onClick={anlegen}>Anlegen</button>
      </div>

      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr><th style={th}>Name</th><th style={th}>Adresse</th><th style={th}>Status</th><th style={th} /></tr></thead>
        <tbody>
          {liste.map((b) => (bearbeite?.id === b.id ? (
            <tr key={b.id}>
              <td style={td}><input style={input} value={bearbeite.name} onChange={(e) => setBearbeite((x) => ({ ...x, name:e.target.value }))} /></td>
              <td style={td}><input style={input} value={bearbeite.adresse} onChange={(e) => setBearbeite((x) => ({ ...x, adresse:e.target.value }))} /></td>
              <td style={td} />
              <td style={{ ...td, whiteSpace:'nowrap' }}>
                <button style={knopf} onClick={speichern}>Speichern</button>{' '}<button style={knopf} onClick={() => setBearbeite(null)}>Abbrechen</button>
              </td>
            </tr>
          ) : (
            <tr key={b.id} style={{ opacity: b.aktiv ? 1 : .55, borderTop:'1px solid var(--border)' }}>
              <td style={td}>{b.name}</td>
              <td style={td}>{b.adresse || <span style={{ color:'var(--text3)' }}>Adresse fehlt noch</span>}</td>
              <td style={td}>{b.aktiv ? 'aktiv' : 'deaktiviert'}</td>
              <td style={{ ...td, whiteSpace:'nowrap' }}>
                <button style={knopf} onClick={() => setBearbeite({ id:b.id, name:b.name, adresse:b.adresse || '' })}>Ändern</button>{' '}
                <button style={knopf} onClick={() => umschalten(b)}>{b.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
              </td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
