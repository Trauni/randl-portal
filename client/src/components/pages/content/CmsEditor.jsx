import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

// ── Farben aus Design-System ────────────────────────────────────────
const cmTheme = EditorView.theme({
  '&': { background: 'var(--bg1)', color: 'var(--text1)', borderRadius: '7px', fontSize: '13px' },
  '.cm-content': { padding: '12px 0', fontFamily: 'DM Mono, monospace' },
  '.cm-gutters': { background: 'var(--bg2)', borderRight: '1px solid var(--border)', color: 'var(--text3)' },
  '.cm-activeLine': { background: 'rgba(255,255,255,.03)' },
  '.cm-activeLineGutter': { background: 'rgba(255,255,255,.03)' },
  '.cm-searchMatch': { background: 'rgba(184,49,31,.4)', outline: '1px solid var(--r)' },
  '.cm-searchMatch.cm-searchMatch-selected': { background: 'rgba(184,49,31,.7)' },
  '.cm-panels': { background: 'var(--bg2)', borderTop: '1px solid var(--border)' },
  '.cm-panel input': { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text1)', borderRadius: '4px', padding: '2px 6px' },
  '.cm-panel button': { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text1)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' },
})

// ── TipTap Section Editor ───────────────────────────────────────────
function SectionEditor({ section, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: section.content,
    onUpdate: ({ editor }) => onChange(section.id, editor.getHTML()),
  })

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>
        {section.label}
        <span style={{ marginLeft: 8, color: 'var(--text3)', opacity: .6 }}>[{section.id}]</span>
      </div>
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 14px',
        color: 'var(--text1)', fontSize: 14, minHeight: 80,
      }}>
        <style>{`
          .tiptap { outline: none; }
          .tiptap p { margin: 0 0 8px; }
          .tiptap p:last-child { margin-bottom: 0; }
          .tiptap strong { color: var(--text1); }
          .tiptap a { color: var(--r); }
          .tiptap ul, .tiptap ol { padding-left: 1.4em; margin: 4px 0; }
        `}</style>
        <EditorContent editor={editor} />
      </div>
      {editor && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {[
            { label: 'B', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
            { label: 'I', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
            { label: 'UL', action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
            { label: 'OL', action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList') },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} style={{
              padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', fontWeight: 600,
              background: btn.active ? 'var(--r)' : 'var(--bg3)',
              border: '1px solid var(--border)',
              color: btn.active ? '#fff' : 'var(--text2)',
            }}>{btn.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Seiten-Liste ────────────────────────────────────────────────────
function PageList() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/content/cms/pages')
      .then(r => r.json())
      .then(d => { setPages(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text3)', padding: 32 }}>Lädt…</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', margin: 0 }}>CMS</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>randl.group Seiteninhalt bearbeiten</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {pages.map(p => (
          <div key={p.id} onClick={() => navigate(`/content/cms/edit/${p.id}`)}
            style={{
              background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9,
              padding: '14px 16px', cursor: 'pointer', transition: 'border-color .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--r)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text1)' }}>{p.label}</span>
              {p.wysiwyg && (
                <span style={{ fontSize: 10, background: 'rgba(74,127,212,.15)', color: 'var(--blue)', padding: '2px 6px', borderRadius: 4 }}>
                  WYSIWYG
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{p.desc}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono, monospace' }}>
              <span>{p.sizeKB > 0 ? `${p.sizeKB} KB` : '—'}</span>
              <span>{p.modified ? new Date(p.modified).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Editor ──────────────────────────────────────────────────────────
function PageEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(null)
  const [code, setCode] = useState('')
  const [sectionUpdates, setSectionUpdates] = useState({})
  const [mode, setMode] = useState('code') // 'code' | 'wysiwyg'
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/content/cms/page/${id}`)
      .then(r => r.json())
      .then(d => {
        setPage(d)
        setCode(d.content || '')
        // Default mode: wysiwyg wenn Sections vorhanden
        if (d.wysiwyg && d.sections?.length > 0) setMode('wysiwyg')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const handleSectionChange = useCallback((sectionId, html) => {
    setSectionUpdates(prev => ({ ...prev, [sectionId]: html }))
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      let res
      if (mode === 'wysiwyg' && page?.wysiwyg) {
        res = await fetch(`/api/content/cms/page/${id}/wysiwyg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: sectionUpdates }),
        })
      } else {
        res = await fetch(`/api/content/cms/page/${id}/code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: code }),
        })
      }
      const data = await res.json()
      if (data.ok) setMsg({ type: 'ok', text: 'Gespeichert ✓' })
      else setMsg({ type: 'err', text: data.error || 'Fehler' })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
    setSaving(false)
    setTimeout(() => setMsg(null), 3000)
  }

  if (loading) return <div style={{ color: 'var(--text3)', padding: 32 }}>Lädt…</div>
  if (!page) return <div style={{ color: 'var(--red2)', padding: 32 }}>Seite nicht gefunden</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 46px - 36px)', gap: 0 }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0 14px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/content/cms')} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text2)', padding: '4px 10px', fontSize: 12, cursor: 'pointer',
          }}>← Zurück</button>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text1)' }}>{page.label}</span>
          {page.previewUrl && (
            <a href={page.previewUrl} target="_blank" rel="noreferrer" style={{
              fontSize: 11, color: 'var(--blue)', textDecoration: 'none',
              border: '1px solid rgba(74,127,212,.3)', borderRadius: 4, padding: '2px 7px',
            }}>Vorschau ↗</a>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {msg && (
            <span style={{ fontSize: 12, color: msg.type === 'ok' ? 'var(--green)' : 'var(--red2)' }}>
              {msg.text}
            </span>
          )}
          {page.wysiwyg && page.sections?.length > 0 && (
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {['wysiwyg', 'code'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '4px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
                  background: mode === m ? 'var(--r)' : 'var(--bg2)',
                  color: mode === m ? '#fff' : 'var(--text2)',
                }}>{m === 'wysiwyg' ? 'Visuell' : 'Code'}</button>
              ))}
            </div>
          )}
          <button onClick={save} disabled={saving} style={{
            background: saving ? 'var(--bg3)' : 'var(--r)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '5px 16px', fontSize: 13,
            fontWeight: 600, cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Editor-Bereich */}
      <div style={{ flex: 1, overflow: 'hidden', borderRadius: 9, border: '1px solid var(--border)' }}>
        {mode === 'code' ? (
          <CodeMirror
            value={code}
            height="100%"
            extensions={[htmlLang(), cmTheme]}
            theme={oneDark}
            onChange={val => setCode(val)}
            style={{ height: '100%', fontSize: 13 }}
          />
        ) : (
          <div style={{ height: '100%', overflowY: 'auto', padding: 18, background: 'var(--bg0)' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Nur markierte Abschnitte sind editierbar. Code-Bereiche bleiben unverändert.
            </p>
            {page.sections.map(s => (
              <SectionEditor key={s.id} section={s} onChange={handleSectionChange} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────────────
export function CmsPage() { return <PageList /> }
export function CmsEditorPage() { return <PageEditor /> }
