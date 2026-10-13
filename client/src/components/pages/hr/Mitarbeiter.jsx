import { useState, useEffect, useCallback } from 'react';

const TAG_LABELS = [
  ['geschaeftsfuehrung', 'Geschäftsführung'],
  ['backoffice', 'Backoffice'],
  ['gashandel', 'Gashandel'],
  ['metallarbeiten', 'Metallarbeiten'],
  ['zeltverleih', 'Zeltverleih'],
];
const TAG_MAP = Object.fromEntries(TAG_LABELS);
const ROLE_LABELS = { mitarbeiter: 'Mitarbeiter', freelancer: 'Freelancer', extern: 'Extern' };

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconSync = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);
const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Detail-Modal ──────────────────────────────────────────────────────────────
function MitarbeiterModal({ emp, onClose, onSave }) {
  const [role, setRole] = useState(emp.role || 'mitarbeiter');
  const [tags, setTags] = useState(emp.access_tags || []);
  const [notes, setNotes] = useState(emp.notes || '');
  const [pushInfo, setPushInfo] = useState(null);
  const [days, setDays] = useState(emp.vacation_days_total ?? 30);
  const [saving, setSaving] = useState(false);

  const taken = emp.vacation_taken || 0;
  const remaining = days - taken;

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await fetch(`/api/hr/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, accessTags: tags, vacation_days_total: days, notes })
      });
      const data = await resp.json().catch(() => ({}));
      onSave();
      if (data.push && data.push.ok === false) { setPushInfo(data.push.error); return; }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--border)',
        borderRadius: '9px', width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 20px', borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--r)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff'
            }}>
              {(emp.firstname?.[0] || emp.displayname?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text1)' }}>{emp.displayname}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                {emp.active ? (
                  <span style={{ color: 'var(--green)' }}>● Aktiv</span>
                ) : (
                  <span style={{ color: 'var(--text3)' }}>● Inaktiv</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text2)',
            cursor: 'pointer', padding: '4px'
          }}><IconClose /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Rentman-Felder (read-only) */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px'
            }}>
              Rentman (schreibgeschützt)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                ['E-Mail', emp.email || '—'],
                ['Telefon', emp.phone || '—'],
                ['Vorname', emp.firstname || '—'],
                ['Nachname', emp.lastname || '—'],
              ].map(([label, val]) => (
                <div key={label} style={{
                  background: 'var(--bg2)', borderRadius: '6px',
                  padding: '8px 10px'
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Urlaubskonto */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px'
            }}>Urlaubskonto</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                ['Gesamt', days, 'var(--blue)'],
                ['Genommen', taken, 'var(--amber)'],
                ['Verbleibend', remaining, remaining < 5 ? 'var(--red2)' : 'var(--green)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  background: 'var(--bg2)', borderRadius: '6px',
                  padding: '10px', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color }}>{val}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
              „Genommen“ zählt alle genehmigten Urlaube dieses Jahres, auch künftige – „Verbleibend“ ist schon um geplanten Urlaub reduziert.
            </div>
          </div>

          {/* Editierbare Felder */}
          <div style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px'
          }}>Portal-Einstellungen</div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '5px' }}>
              Rolle
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '8px 10px', color: 'var(--text1)',
                fontSize: '13px', boxSizing: 'border-box', cursor: 'pointer'
              }}
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="freelancer">Freelancer</option>
              <option value="extern">Extern — kein Portal-Zugriff</option>
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '5px' }}>
              Zugriffe
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {TAG_LABELS.map(([key, label]) => {
                const an = tags.includes(key);
                const aus = role === 'extern';
                return (
                  <button key={key} type="button" disabled={aus}
                    onClick={() => setTags(an ? tags.filter(t => t !== key) : [...tags, key])}
                    style={{
                      background: an ? 'var(--r)' : 'var(--bg2)',
                      border: '1px solid ' + (an ? 'var(--r)' : 'var(--border)'),
                      borderRadius: '6px', padding: '5px 10px',
                      color: an ? '#fff' : 'var(--text2)', fontSize: '12px',
                      cursor: aus ? 'not-allowed' : 'pointer', opacity: aus ? 0.4 : 1
                    }}>{label}</button>
                );
              })}
            </div>
            {role === 'extern' && (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                Externe erhalten keine Portal-Bereiche.
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '5px' }}>
              Urlaubstage gesamt / Jahr
            </label>
            <input
              type="number" min="0" max="365"
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              style={{
                width: '120px', background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '8px 10px', color: 'var(--text1)', fontSize: '13px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '5px' }}>
              Notiz
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{
                width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '8px 10px', color: 'var(--text1)',
                fontSize: '13px', boxSizing: 'border-box', resize: 'vertical'
              }} />
          </div>
          {pushInfo && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--red2)', borderRadius: '6px',
              padding: '8px 10px', marginBottom: '12px', fontSize: '12px', color: 'var(--red2)'
            }}>Gespeichert — aber der Authentik-Push schlug fehl: {pushInfo}</div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', background: 'var(--r)', border: 'none',
              borderRadius: '6px', padding: '10px', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function Mitarbeiter() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('active'); // 'all' | 'active' | 'inactive'
  const [search, setSearch] = useState('');
  const [lastSync, setLastSync] = useState(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/employees');
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/hr/rentman/status');
    const data = await res.json();
    if (data.stats?.last_sync) setLastSync(data.stats.last_sync);
  }, []);

  useEffect(() => {
    loadEmployees();
    loadStatus();
  }, [loadEmployees, loadStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/hr/rentman/sync', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);
      await loadEmployees();
      await loadStatus();
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = employees.filter(e => {
    if (filter === 'active' && !e.active) return false;
    if (filter === 'inactive' && e.active) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (e.displayname || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.access_tags || []).some(t => (TAG_MAP[t] || t).toLowerCase().includes(q))
      );
    }
    return true;
  });

  const formatDate = d => d ? new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : '—';

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text1)' }}>
            Mitarbeiter
          </h1>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>
            Letzter Rentman-Sync: {formatDate(lastSync)}
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: syncing ? 'var(--bg3)' : 'var(--r)',
            border: 'none', borderRadius: '7px', padding: '9px 16px',
            color: '#fff', fontSize: '13px', fontWeight: 600,
            cursor: syncing ? 'not-allowed' : 'pointer',
            transition: 'background .15s'
          }}
        >
          <IconSync /> {syncing ? 'Sync läuft...' : 'Sync mit Rentman'}
        </button>
      </div>

      {/* Sync-Ergebnis Banner */}
      {syncResult && (
        <div style={{
          background: syncResult.error ? 'rgba(224,80,80,.1)' : 'rgba(46,189,122,.1)',
          border: `1px solid ${syncResult.error ? 'var(--red2)' : 'var(--green)'}`,
          borderRadius: '7px', padding: '10px 14px', marginBottom: '16px',
          fontSize: '13px', color: syncResult.error ? 'var(--red2)' : 'var(--green)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>
            {syncResult.error
              ? `Fehler: ${syncResult.error}`
              : `✓ Sync abgeschlossen — ${syncResult.created} neu, ${syncResult.updated} aktualisiert, ${syncResult.total} gesamt`
            }
          </span>
          <button onClick={() => setSyncResult(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'inherit', opacity: 0.7, fontSize: '16px', lineHeight: 1
          }}>×</button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap'
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suche nach Name, E-Mail, Abteilung..."
          style={{
            flex: 1, minWidth: '200px', background: 'var(--bg2)',
            border: '1px solid var(--border)', borderRadius: '7px',
            padding: '8px 12px', color: 'var(--text1)', fontSize: '13px'
          }}
        />
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: '7px', overflow: 'hidden',
          border: '1px solid var(--border)' }}>
          {[['active', 'Aktiv'], ['inactive', 'Inaktiv'], ['all', 'Alle']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '8px 14px', fontSize: '12px', fontWeight: 600,
              background: filter === val ? 'var(--bg3)' : 'transparent',
              color: filter === val ? 'var(--text1)' : 'var(--text3)',
              border: 'none', cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Tabelle */}
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--border)',
        borderRadius: '9px', overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            Lade Mitarbeiter...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            Keine Mitarbeiter gefunden. Bitte erst "Sync mit Rentman" ausführen.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Mitarbeiter', 'E-Mail', 'Telefon', 'Rolle & Zugriffe', 'Urlaub', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600, color: 'var(--text3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => {
                const taken = emp.vacation_taken || 0;
                const total = emp.vacation_days_total || 30;
                const remaining = total - taken;
                return (
                  <tr key={emp.id} style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: emp.active ? 1 : 0.5,
                    transition: 'background .1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Name */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: emp.active ? 'var(--r)' : 'var(--bg3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0
                        }}>
                          {(emp.firstname?.[0] || emp.displayname?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text1)' }}>
                            {emp.displayname}
                          </div>
                          {emp.username && (
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>@{emp.username}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* E-Mail */}
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text2)' }}>
                      {emp.email || <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    {/* Telefon */}
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text2)' }}>
                      {emp.phone || <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    {/* Abteilung */}
                    <td style={{ padding: '12px 14px' }}>
                      {(() => (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <span style={{
                            border: '1px solid var(--border)', borderRadius: '5px',
                            padding: '2px 7px', fontSize: '11px', color: 'var(--text3)'
                          }}>{ROLE_LABELS[emp.role] || 'Mitarbeiter'}</span>
                          {(emp.access_tags || []).map(t => (
                            <span key={t} style={{
                              background: 'var(--bg3)', borderRadius: '5px',
                              padding: '3px 8px', fontSize: '12px', color: 'var(--text2)'
                            }}>{TAG_MAP[t] || t}</span>
                          ))}
                        </div>
                      ))()}
                    </td>
                    {/* Urlaub */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: '13px' }} title="Verbleibend = Anspruch minus alle genehmigten Urlaube dieses Jahres, auch künftige">
                        <span style={{ color: remaining < 5 ? 'var(--red2)' : 'var(--green)', fontWeight: 600 }}>
                          {remaining}
                        </span>
                        <span style={{ color: 'var(--text3)' }}> / {total} Tage</span>
                      </div>
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 500,
                        color: emp.active ? 'var(--green)' : 'var(--text3)'
                      }}>
                        {emp.active ? '● Aktiv' : '○ Inaktiv'}
                      </span>
                    </td>
                    {/* Edit */}
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => setSelected(emp)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          background: 'var(--bg3)', border: '1px solid var(--border)',
                          borderRadius: '5px', padding: '5px 10px',
                          color: 'var(--text2)', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        <IconEdit /> Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Info */}
      {!loading && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text3)' }}>
          {filtered.length} von {employees.length} Mitarbeitern
        </div>
      )}

      {/* Modal */}
      {selected && (
        <MitarbeiterModal
          emp={selected}
          onClose={() => setSelected(null)}
          onSave={loadEmployees}
        />
      )}
    </div>
  );
}
