// /home/radmin/web/randlweb.de/public_html/portal/client/src/components/pages/it/Wartung.jsx
import { useState, useEffect, useCallback } from 'react';

function fmtBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtZeit(iso) {
  return iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }) : '–';
}

// Cron mit Sekunden (Watchtower): "0 15 10 * * *" -> "täglich 10:15 Uhr"
function fmtZeitplan(wt) {
  if (wt.zeitplan) {
    const p = wt.zeitplan.trim().split(/\s+/);
    if (p.length === 6 && p.slice(3).every(x => x === '*') && /^\d+$/.test(p[1]) && /^\d+$/.test(p[2])) {
      return `täglich ${p[2].padStart(2, '0')}:${p[1].padStart(2, '0')} Uhr (UTC des Containers)`;
    }
    return wt.zeitplan;
  }
  if (wt.intervall_s) return `alle ${Math.round(wt.intervall_s / 60)} Minuten`;
  return 'Standard (alle 24 h)';
}

const card = { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 };
const cardTitle = { fontWeight: 600, fontSize: 15, marginBottom: 14, color: '#111827' };
const label = { color: '#6b7280', fontSize: 13 };

export default function Wartung() {
  const [data, setData]   = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch('/api/it/maintenance/status');
      if (!r.ok) throw new Error('Laden fehlgeschlagen (' + r.status + ')');
      setData(await r.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 32, color: '#6b7280' }}>Lädt…</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#111827' }}>Server-Wartung</h1>
          <p style={{ color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
            Backups, Zertifikate, Auto-Updates und Speicherplatz auf einen Blick.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
            ↻ Neu laden
          </button>
          <a href="/it/cleanup" style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            🧹 Zum Server-Cleanup
          </a>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
          <strong>Fehler:</strong> {error}
        </div>
      )}

      {data && (
        <>
          {/* Backups */}
          <div style={card}>
            <div style={cardTitle}>Backups</div>
            {['shopware', 'gas_db'].map(key => {
              const b = data.backups[key];
              const okColor = b.warn ? '#dc2626' : '#059669';
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: key === 'shopware' ? '1px solid #f3f4f6' : 'none' }}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{key === 'shopware' ? 'Shopware' : 'gas-db (Kundendaten)'}</div>
                    <div style={label}>{b.file || 'kein Backup gefunden'}</div>
                  </div>
                  <div style={{ textAlign: 'right', color: okColor, fontWeight: 600 }}>
                    {b.age_hours === null ? '⚠ fehlt' : `${b.age_hours}h alt`}
                    {b.warn && b.age_hours !== null && <div style={{ fontSize: 11, color: '#dc2626' }}>⚠ älter als 26h</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zertifikate */}
          <div style={card}>
            <div style={cardTitle}>SSL-Zertifikate</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {data.certificates.map((c, i) => (
                  <tr key={i} style={{ borderBottom: i < data.certificates.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '7px 4px', color: '#111827' }}>{c.label}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 600, color: c.warn ? '#dc2626' : '#059669' }}>
                      {c.days_left} Tage {c.warn && '⚠'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Watchtower (#396) */}
          {data.watchtower && (
            <div style={card}>
              <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between' }}>
                <span>Watchtower — automatische Updates</span>
                {data.watchtower.vorhanden && (
                  <span style={{ fontSize: 13, color: data.watchtower.laeuft ? '#059669' : '#dc2626' }}>
                    {data.watchtower.laeuft ? '● läuft' : '● gestoppt'}
                  </span>
                )}
              </div>
              {!data.watchtower.vorhanden ? (
                <div style={label}>Kein Container „watchtower“ gefunden.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div><div style={label}>Zeitplan</div><div style={{ fontSize: 13, color: '#111827' }}>{fmtZeitplan(data.watchtower)}</div></div>
                    <div><div style={label}>Modus</div><div style={{ fontSize: 13, color: '#111827' }}>
                      {data.watchtower.nur_melden ? 'meldet nur, installiert nichts' : 'installiert automatisch'}
                    </div></div>
                    <div><div style={label}>Ausgenommen</div><div style={{ fontSize: 13, color: '#111827' }}>Container mit Label <code>enable=false</code></div></div>
                  </div>

                  <div style={{ ...label, marginBottom: 4 }}>Letzte Läufe</div>
                  {data.watchtower.laeufe.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Keine Läufe in den letzten 30 Tagen im Log.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
                      <tbody>
                        {data.watchtower.laeufe.map((l, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '5px 4px', color: '#111827' }}>{fmtZeit(l.time)}</td>
                            <td style={{ padding: '5px 4px', color: '#6b7280' }}>{l.gescannt} geprüft</td>
                            <td style={{ padding: '5px 4px', color: l.aktualisiert ? '#1d4ed8' : '#6b7280' }}>{l.aktualisiert} aktualisiert</td>
                            <td style={{ padding: '5px 4px', textAlign: 'right', color: l.fehler ? '#dc2626' : '#059669' }}>{l.fehler ? `${l.fehler} Fehler ⚠` : 'ok'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div style={{ ...label, marginBottom: 4 }}>
                    {data.watchtower.nur_melden
                      ? 'Gefunden, nicht installiert (30 Tage) – einspielen im Docker Dashboard'
                      : 'Automatisch aktualisiert (30 Tage)'}
                  </div>
                  {data.watchtower.updates.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>Keine Updates im Zeitraum.</div>
                  ) : (
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                      {data.watchtower.updates.map((u, i) => <div key={i}>{fmtZeit(u.time)} — {u.image}</div>)}
                    </div>
                  )}

                  {data.watchtower.fehler.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: 12, color: '#dc2626', lineHeight: 1.6 }}>
                      {data.watchtower.fehler.map((f, i) => <div key={i}>⚠ {fmtZeit(f.time)} — {f.msg}</div>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Verfügbare Updates aller Container (#396) */}
          {data.container_updates && (
            <div style={card}>
              <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between' }}>
                <span>Verfügbare Updates</span>
                <a href="/it/docker" style={{ fontSize: 13, fontWeight: 500, color: '#1d4ed8', textDecoration: 'none' }}>Zum Docker Dashboard →</a>
              </div>
              {data.container_updates.laeuft && !data.container_updates.geprueft_am ? (
                <div style={label}>Prüfung läuft… gleich neu laden.</div>
              ) : (
                <>
                  {data.container_updates.neue_version.map((v, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                      <span style={{ color: '#111827' }}>{v.name} <span style={{ color: '#6b7280' }}>({v.image})</span></span>
                      <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{v.version} verfügbar</span>
                    </div>
                  ))}
                  {data.container_updates.neues_image.length > 0 && (
                    <div style={{ fontSize: 13, color: '#b45309', padding: '6px 0' }}>
                      Neues Image für den gleichen Tag: {data.container_updates.neues_image.join(', ')}
                    </div>
                  )}
                  {!data.container_updates.neue_version.length && !data.container_updates.neues_image.length && (
                    <div style={{ fontSize: 13, color: '#059669' }}>✓ Alle prüfbaren Container sind aktuell.</div>
                  )}
                  <div style={{ ...label, fontSize: 11, marginTop: 8 }}>
                    Geprüft: {fmtZeit(data.container_updates.geprueft_am)} · neue Versionen trägt man in docker-compose/.env ein, neue Images lassen sich im Docker Dashboard per Knopf einspielen.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Disk */}
          <div style={card}>
            <div style={cardTitle}>Speicherplatz</div>
            {data.disk ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={label}>{data.disk.available} frei von {data.disk.total}</div>
                <div style={{ fontWeight: 600, color: data.disk.used_pct > 85 ? '#dc2626' : '#059669' }}>{data.disk.used_pct}% belegt</div>
              </div>
            ) : <div style={label}>Nicht verfügbar</div>}
          </div>

          {/* Docker Log-Größen */}
          <div style={card}>
            <div style={cardTitle}>Größte Docker-Container-Logs</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {data.docker_log_sizes.map((d, i) => (
                  <tr key={i} style={{ borderBottom: i < data.docker_log_sizes.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '7px 4px', color: '#111827' }}>{d.container}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', color: d.size_bytes > 104857600 ? '#dc2626' : '#6b7280' }}>{fmtBytes(d.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
            Stand: {new Date(data.timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
          </div>
        </>
      )}
    </div>
  );
}
