// /home/radmin/web/randlweb.de/public_html/portal/client/src/components/pages/it/Cleanup.jsx
import { useState, useEffect, useCallback } from 'react';

const STEP_LABELS = {
  bak_files:         '.bak-Dateien',
  docker_containers: 'Docker Container',
  docker_images:     'Docker Images',
  docker_volumes:    'Docker Volumes',
  tmp_cleanup:       '/tmp/ Dateien',
  pm2_logs:          'pm2 Logs',
};

function fmtBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin'
    });
  } catch { return iso; }
}

export default function Cleanup() {
  const [result, setResult]       = useState(null);
  const [running, setRunning]     = useState(false);
  const [output, setOutput]       = useState('');
  const [error, setError]         = useState('');
  const [userIsAdmin, setAdmin]   = useState(false);

  const loadResult = useCallback(async () => {
    try {
      const r = await fetch('/api/it/cleanup/result');
      if (r.ok) setResult(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadResult();
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (!u) return;
        const g = u.user?.groups || u.groups || [];
        setAdmin(g.some(x => ['Geschäftsführung', 'Verwaltung','Backoffice'].includes(x)));
      })
      .catch(() => {});
  }, [loadResult]);

  const runCleanup = async () => {
    if (!window.confirm(
      'Server-Cleanup starten?\n\n' +
      'Entfernt .bak-Dateien, ungenutzte Docker-Ressourcen,\n' +
      'alte /tmp/-Dateien und pm2-Logs.\n\n' +
      'Kann bis zu 2 Minuten dauern.'
    )) return;
    setRunning(true);
    setError('');
    setOutput('Cleanup läuft… (kann bis zu 2 Minuten dauern)');
    try {
      const r = await fetch('/api/it/cleanup/run', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Fehler beim Cleanup');
        setOutput('');
      } else {
        setOutput(data.output || '');
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
      setOutput('');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', fontFamily: 'inherit' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#111827' }}>Server Cleanup</h1>
        <p style={{ color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
          Entfernt .bak-Dateien, ungenutzte Docker-Ressourcen, alte /tmp/-Dateien und pm2-Logs.
        </p>
      </div>

      {result ? (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>Letzter Cleanup</div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>{fmtDate(result.timestamp)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>
                {fmtBytes(result.total_freed_bytes)}
              </div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>freigegeben</div>
            </div>
          </div>
          {result.steps?.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Schritt</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Freigegeben</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((step, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500, color: '#111827' }}>
                      {STEP_LABELS[step.name] || step.name}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right',
                      color: step.freed_bytes > 0 ? '#059669' : '#9ca3af',
                      fontWeight: step.freed_bytes > 0 ? 600 : 400 }}>
                      {step.freed_bytes > 0 ? fmtBytes(step.freed_bytes) : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: 12,
                      maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {step.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 24, color: '#6b7280', fontSize: 14 }}>
          Noch kein Cleanup-Ergebnis vorhanden.
        </div>
      )}

      {userIsAdmin ? (
        <button
          onClick={runCleanup}
          disabled={running}
          style={{
            background: running ? '#9ca3af' : '#1d4ed8', color: '#fff', border: 'none',
            borderRadius: 6, padding: '10px 22px', fontSize: 14, fontWeight: 600,
            cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}>
          {running ? (
            <>
              <span style={{
                display: 'inline-block', width: 14, height: 14,
                border: '2px solid #fff', borderTopColor: 'transparent',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite'
              }} />
              Cleanup läuft…
            </>
          ) : '🧹 Cleanup starten'}
        </button>
      ) : (
        <div style={{ color: '#9ca3af', fontSize: 14, padding: '10px 0' }}>
          Nur Admins (Geschäftsführung / Verwaltung) können Cleanup starten.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
          <strong>Fehler:</strong> {error}
        </div>
      )}

      {output && (
        <pre style={{
          marginTop: 20, background: '#0f172a', color: '#e2e8f0', padding: 16,
          borderRadius: 8, fontSize: 12, overflowX: 'auto', maxHeight: 400, overflowY: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{output}</pre>
      )}

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
