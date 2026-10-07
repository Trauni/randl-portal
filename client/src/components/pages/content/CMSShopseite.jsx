// portal/client/src/components/pages/content/CMSShopseite.jsx
// CMS Shopseite – Texte und Zusatz-CSS, wirken sofort (gasshop #281)

import React, { useState, useEffect, useCallback } from 'react';

const API = '/api';

// ──────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────
const IconSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IconCode = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ──────────────────────────────────────────────
// Tab 1: Texte & Beschriftungen
// ──────────────────────────────────────────────
function TabTexte() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/shop-cms/config`, {
        
      });
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      setConfig(await res.json());
      setDirty(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess(null);
  };

  const updateCat = (id, value) => {
    setConfig(prev => ({
      ...prev,
      categories: { ...prev.categories, [id]: value }
    }));
    setDirty(true);
    setSuccess(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/shop-cms/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      setSuccess('Gespeichert – sofort live auf shop.randl.group');
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 13 }}>
      Lade Konfiguration…
    </div>
  );

  const inputStyle = {
    width: '100%', padding: '8px 11px', fontSize: 13,
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 7, color: 'var(--text1)', boxSizing: 'border-box',
    fontFamily: 'DM Sans, sans-serif'
  };
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 500,
    color: 'var(--text2)', marginBottom: 5
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--green)' }}>
          ✓ kein Rebuild nötig – Änderungen sind sofort live
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--red2)' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(46,189,122,0.1)', border: '1px solid var(--green)', borderRadius: 7, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconCheck /> {success}
        </div>
      )}

      {/* Sektion: Allgemeine Texte */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 9, padding: '16px 18px', marginBottom: 16
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 14 }}>
          Allgemeine Texte
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Preishinweis (unter Produkten)</label>
          <input
            type="text"
            value={config.priceNotice || ''}
            onChange={e => update('priceNotice', e.target.value)}
            style={inputStyle}
            placeholder="z.B. Alle Preise sind Nettopreise zzgl. gesetzlicher MwSt."
          />
        </div>

        <div>
          <label style={labelStyle}>Login-Untertitel</label>
          <input
            type="text"
            value={config.loginSubtitle || ''}
            onChange={e => update('loginSubtitle', e.target.value)}
            style={inputStyle}
            placeholder="z.B. Gashandel - Gewerbe, Camper und Haushalter"
          />
        </div>
      </div>

      {/* Sektion: Kategorie-Labels */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 9, padding: '16px 18px', marginBottom: 20
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 14 }}>
          Kategorie-Bezeichnungen
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'].map(id => (
            <div key={id}>
              <label style={labelStyle}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>{id}</span>
                {' '}→ Anzeigename
              </label>
              <input
                type="text"
                value={config.categories?.[id] || ''}
                onChange={e => updateCat(id, e.target.value)}
                style={inputStyle}
                placeholder={id}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Speichern-Button */}
      <button
        onClick={save}
        disabled={saving || !dirty}
        style={{
          padding: '9px 20px', fontSize: 13, fontWeight: 600,
          background: dirty ? 'var(--r)' : 'var(--bg3)',
          color: dirty ? '#fff' : 'var(--text3)',
          border: 'none', borderRadius: 7,
          cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 8
        }}
      >
        <IconSave />
        {saving ? 'Speichere…' : dirty ? 'Änderungen speichern' : 'Keine Änderungen'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Einfacher CSS-Editor (kein externes CodeMirror nötig)
// ──────────────────────────────────────────────
function SimpleCodeEditor({ value, onChange }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      spellCheck={false}
      style={{
        width: '100%',
        height: 460,
        padding: '12px 14px',
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: 'DM Mono, Consolas, Monaco, monospace',
        background: '#0d1117',
        color: '#e6edf3',
        border: '1px solid var(--border)',
        borderRadius: 8,
        resize: 'vertical',
        boxSizing: 'border-box',
        outline: 'none',
        tabSize: 2
      }}
      onKeyDown={(e) => {
        // Tab-Support
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = e.target.selectionStart;
          const end = e.target.selectionEnd;
          const newValue = value.substring(0, start) + '  ' + value.substring(end);
          onChange(newValue);
          requestAnimationFrame(() => {
            e.target.selectionStart = e.target.selectionEnd = start + 2;
          });
        }
      }}
    />
  );
}

// ──────────────────────────────────────────────
// Tab 2: CSS anpassen
// ──────────────────────────────────────────────
function TabCSS() {
  const [css, setCss] = useState('');
  const [originalCss, setOriginalCss] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadCss = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/shop-cms/css`, {
        
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'CSS laden fehlgeschlagen');
      }
      const data = await res.json();
      setCss(data.css);
      setOriginalCss(data.css);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCss(); }, [loadCss]);

  const dirty = css !== originalCss;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/shop-cms/css`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ css })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      setOriginalCss(css);
      setSuccess('Gespeichert – sofort live auf shop.randl.group (Seite im Shop neu laden)');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setCss(originalCss);
    setSuccess(null);
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 13 }}>
      Lade Zusatz-CSS…
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--green)' }}>
          ✓ kein Rebuild nötig – Änderungen sind sofort live
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
          Ergänzt das Grund-CSS des Shops und überschreibt es bei Bedarf
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--red2)' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(46,189,122,0.1)', border: '1px solid var(--green)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconCheck /> {success}
        </div>
      )}

      {/* CSS-Editor */}
      <SimpleCodeEditor value={css} onChange={v => { setCss(v); setSuccess(null); }} />

      {/* Zeilen-Info */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginBottom: 14 }}>
        {css.split('\n').length} Zeilen · {css.length} Zeichen
        {dirty && <span style={{ color: 'var(--amber)', marginLeft: 10 }}>● nicht gespeichert</span>}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={save}
          disabled={saving || !dirty}
          style={{
            padding: '9px 18px', fontSize: 13, fontWeight: 600,
            background: dirty ? 'var(--r)' : 'var(--bg3)',
            color: dirty ? '#fff' : 'var(--text3)',
            border: 'none', borderRadius: 7,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <IconSave />
          {saving ? 'Speichere…' : 'Speichern'}
        </button>

        {dirty && (
          <button
            onClick={reset}
            style={{
              padding: '9px 14px', fontSize: 13,
              background: 'var(--bg2)', color: 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer'
            }}
          >
            Zurücksetzen
          </button>
        )}

        <button
          onClick={loadCss}
          style={{
            padding: '9px 14px', fontSize: 13,
            background: 'var(--bg2)', color: 'var(--text2)',
            border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto'
          }}
        >
          <IconRefresh /> Neu laden
        </button>
      </div>

    </div>
  );
}

// ──────────────────────────────────────────────
// Haupt-Komponente: CMSShopseite
// ──────────────────────────────────────────────
export default function CMSShopseite() {
  const [activeTab, setActiveTab] = useState('texte');

  const tabs = [
    { id: 'texte',   label: 'Texte & Labels',     icon: '✎', badge: null },
    { id: 'css',     label: 'Zusatz-CSS',          icon: '{}', badge: null }
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text1)' }}>
          CMS Shopseite
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
          Texte und Zusatz-CSS für shop.randl.group – Änderungen wirken sofort
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: '1px solid var(--border)'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--r)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--r2)' : 'var(--text2)',
              cursor: 'pointer', marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{tab.icon}</span>
            {tab.label}
            {tab.badge && (
              <span style={{
                fontSize: 10, background: 'rgba(232,160,32,0.15)',
                color: 'var(--amber)', padding: '1px 6px', borderRadius: 4
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab-Content */}
      {activeTab === 'texte' && <TabTexte />}
      {activeTab === 'css' && <TabCSS />}
    </div>
  );
}
