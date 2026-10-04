// client/src/components/pages/zeltverleih/Zeltplaner.jsx
//
// Faithful React-Portierung von zeltplaner.html (getesteter Prototyp, 30.07.2026,
// hochgeladen 14.08.2026). Mathematik/Interaktion 1:1 aus dem Original übernommen —
// Objekte werden wie im Original über die LINKE OBERE ECKE (x,y in Metern) gespeichert,
// Rotation ist ein Toggle (0/1 = 0°/90°, nicht 4-stufig), Drehen verschiebt x/y so, dass
// der Mittelpunkt erhalten bleibt (siehe rotateSel unten — exakt wie im Original).
//
// Geometrie gegen den Regressionstest (Seite 189) nachgerechnet:
//   Galazelt 12×6 m  → 80 Sitzplätze / 0,90 m² pro Sitzplatz / 47 % Belegung
//   Weinzelt 21×12 m → 128 Sitzplätze / 1,97 m² pro Sitzplatz / 34 % Belegung
// Die beiden Referenzlayouts sind in sql/001_zelt_tables.sql mit der aus dem
// Original extrahierten Geometrie hinterlegt und rechnerisch verifiziert.
//
// Fallstricke bewusst eingehalten:
//  - EIN gemeinsamer Maßstab PX für X und Y (dynamisch berechnet, wie im Original).
//  - Canvas bekommt echte Pixelmaße über style.width UND style.height (nicht nur CSS %),
//    plus DPR-Skalierung fürs Attribut wie im Original.
//  - useRef + useEffect fürs Canvas, alle Listener werden beim Unmount abgeräumt.
//  - Maßstabsbalken "1 m" als Dauer-Sichtkontrolle gegen den Verzerrungs-Bug.
//  - Personenzahlen/Maße: "!== null" statt Kurzform prüfen (0 ist gültig).

import React, { useState, useRef, useEffect, useCallback } from 'react';

// Zelttypen bleiben bewusst im Code (kein Stammdatenfall) — 1:1 aus TENTS in zeltplaner.html.
const TENTS = {
  gala:   { label: 'Galazelt',        w: 6,  raster: 3, min: 3, recMax: 21, techMax: 30, hint: 'Über 21 m technisch möglich, optisch aber ein langer Schlauch.' },
  wein:   { label: 'Weinzelt',        w: 12, raster: 3, min: 6, recMax: 36, techMax: 42, hint: 'Pagode kann angebaut werden.' },
  pagode: { label: 'Pagode (Reihe)',  w: 6,  raster: 6, min: 6, recMax: 18, techMax: 18, hint: '3 Einheiten vorhanden. L-Form noch nicht abgebildet.' },
  falt36: { label: 'Faltzelt 3 × 6 m',w: 3,  raster: 6, min: 6, recMax: 6,  techMax: 6,  hint: 'Für Bestuhlungsplanung kaum relevant.' },
  falt48: { label: 'Faltzelt 4 × 8 m',w: 4,  raster: 8, min: 8, recMax: 8,  techMax: 8,  hint: 'Für Bestuhlungsplanung kaum relevant.' },
};

const SNAP = 0.1;
const PAD = 34;

const round2 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s);

export default function Zeltplaner() {
  const [baseDefs, setBaseDefs] = useState([]);   // Grundbestand vom Backend (kategorie bestuhlung/technik)
  const [customDefs, setCustomDefs] = useState([]); // eigene Objekte vom Backend (kategorie eigene)
  const [references, setReferences] = useState([]);
  const [statsView, setStatsView] = useState({ pers: 0, sitz: 0, area: 0, pp: null, fill: 0, free: 0 });
  const [warnMsgs, setWarnMsgs] = useState([{ level: 'o', text: 'Keine Auffälligkeiten.' }]);
  const [bomRows, setBomRows] = useState([]);
  const [selInfo, setSelInfo] = useState('Nichts ausgewählt.');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDef, setEditingDef] = useState(null); // null = Anlegen, sonst das zu bearbeitende Objekt
  const [saveName, setSaveName] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [tentUI, setTentUI] = useState({ type: 'gala', len: 12 }); // nur für die Steuerelemente

  const canvasRef = useRef(null);
  const scrollerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Mutable "Engine"-State, exakt wie die globalen Variablen im Original —
  // bewusst NICHT über React state, weil Drag/Zeichnen bei jedem Mausevent
  // laufen muss, ohne auf einen Re-Render zu warten.
  const engine = useRef({
    tent: { type: 'gala', len: 12 },
    objs: [],       // {uid, defSlug, x, y, rot}
    selection: [],  // Teilmenge von objs (per Referenz)
    drag: null,
    band: null,
    uid: 1,
    CAT: [],        // baseDefs + customDefs, flach
  }).current;

  // ---- Katalog + Referenzen laden -----------------------------------------
  useEffect(() => {
    fetch('/api/zeltverleih/objekte', { credentials: 'include' })
      .then((r) => r.json())
      .then((rows) => {
        setBaseDefs(rows.filter((r) => r.kategorie !== 'eigene'));
        setCustomDefs(rows.filter((r) => r.kategorie === 'eigene'));
      })
      .catch((err) => console.error('[Zeltplaner] Katalog laden fehlgeschlagen', err));

    fetch('/api/zeltverleih/layouts', { credentials: 'include' })
      .then((r) => r.json())
      .then(setReferences)
      .catch((err) => console.error('[Zeltplaner] Referenzen laden fehlgeschlagen', err));
  }, []);

  useEffect(() => {
    engine.CAT = [...baseDefs, ...customDefs];
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDefs, customDefs]);

  const defBySlug = useCallback((slug) => engine.CAT.find((c) => c.slug === slug), [engine]);

  // ---- Geometrie-Helfer (1:1 aus zeltplaner.html) -------------------------
  function dims(o) {
    const c = defBySlug(o.defSlug);
    if (!c) return { w: 0, h: 0 };
    const l = Number(c.laenge), t = Number(c.tiefe);
    return o.rot ? { w: t, h: l } : { w: l, h: t };
  }
  function isSel(o) { return engine.selection.indexOf(o) !== -1; }
  function hit(a, b) {
    const A = dims(a), B = dims(b);
    return a.x < b.x + B.w - 0.01 && a.x + A.w > b.x + 0.01 &&
           a.y < b.y + B.h - 0.01 && a.y + A.h > b.y + 0.01;
  }
  function bbox(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach((o) => {
      const d = dims(o);
      x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
      x1 = Math.max(x1, o.x + d.w); y1 = Math.max(y1, o.y + d.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---- Objekt platzieren (Auto-Positionierung wie im Original) -----------
  function addObj(slug, x, y, rot) {
    const c = defBySlug(slug);
    if (!c) return null;
    const T = TENTS[engine.tent.type];
    const l = Number(c.laenge), t = Number(c.tiefe);

    if (x === undefined) {
      x = 0.2; y = 0.2;
      let placed = false;
      outer:
      for (let yy = 0.2; yy <= T.w - t; yy += 0.2) {
        for (let xx = 0.2; xx <= engine.tent.len - l; xx += 0.2) {
          if (!engine.objs.some((o) => hit(o, { defSlug: slug, x: xx, y: yy, rot: 0 }))) {
            x = xx; y = yy; placed = true; break outer;
          }
        }
      }
      if (!placed) { x = 0.2; y = 0.2; }
    }
    const o = { uid: engine.uid++, defSlug: slug, x, y, rot: rot || 0 };
    engine.objs.push(o);
    engine.selection = [o];
    draw();
    return o;
  }

  // ---- Drehen / Duplizieren / Löschen / Auswahl (1:1 aus dem Original) ---
  function rotateSel() {
    if (!engine.selection.length) return;
    engine.selection.forEach((o) => {
      const d = dims(o);
      // Mittelpunkt bleibt erhalten: x/y so verschieben, dass die (jetzt vertauschte)
      // Bounding-Box zentriert auf demselben Punkt liegt wie vorher.
      o.x = round2(o.x + (d.w - d.h) / 2);
      o.y = round2(o.y + (d.h - d.w) / 2);
      o.rot = o.rot ? 0 : 1;
    });
    draw();
  }
  function dupSel() {
    if (!engine.selection.length) return;
    const b = bbox(engine.selection);
    const off = b.w + 0.1;
    const copies = engine.selection.map((o) => ({
      uid: engine.uid++, defSlug: o.defSlug, x: round2(o.x + off), y: o.y, rot: o.rot,
    }));
    engine.objs.push(...copies);
    engine.selection = copies;
    draw();
  }
  function delSel() {
    if (!engine.selection.length) return;
    engine.objs = engine.objs.filter((o) => !isSel(o));
    engine.selection = [];
    draw();
  }
  function selectAllFn() { engine.selection = engine.objs.slice(); draw(); }
  function clearSelFn() { engine.selection = []; draw(); }
  function clearAllFn() {
    if (engine.objs.length && !window.confirm('Alle Objekte aus dem Plan entfernen?')) return;
    engine.objs = []; engine.selection = []; draw();
  }

  // ---- Tastatur (1:1 aus dem Original, inkl. der Reihenfolge der Checks) -
  useEffect(() => {
    function onKeyDown(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'a') { selectAllFn(); e.preventDefault(); return; }
      if (!engine.selection.length) return;
      if (k === 'r') { rotateSel(); e.preventDefault(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { delSel(); e.preventDefault(); }
      if (k === 'd') { dupSel(); e.preventDefault(); }
      if (e.key === 'Escape') { clearSelFn(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown); // Fallstrick: Listener MUSS abgeräumt werden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Zelttyp / Länge wechseln -------------------------------------------
  function handleTentTypeChange(newType) {
    const T = TENTS[newType];
    let len = Math.min(Math.max(engine.tent.len, T.min), T.recMax);
    len = Math.round(len / T.raster) * T.raster || T.min;
    engine.tent = { type: newType, len };
    setTentUI({ type: newType, len });
    draw();
  }
  function handleTentLenChange(newLen) {
    engine.tent = { ...engine.tent, len: newLen };
    setTentUI((prev) => ({ ...prev, len: newLen }));
    draw();
  }

  // ---- Maus/Pointer-Interaktion (1:1 aus dem Original, Pointer Events) ---
  function pt(e) {
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: ((e.clientX - r.left) * (cv.width / dpr / r.width) - PAD) / engine.px,
      y: ((e.clientY - r.top) * (cv.height / dpr / r.height) - PAD) / engine.px,
    };
  }
  function at(p) {
    for (let i = engine.objs.length - 1; i >= 0; i--) {
      const o = engine.objs[i], d = dims(o);
      if (p.x >= o.x && p.x <= o.x + d.w && p.y >= o.y && p.y <= o.y + d.h) return o;
    }
    return null;
  }

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    function onPointerDown(e) {
      const p = pt(e), found = at(p), addMode = e.shiftKey || e.ctrlKey || e.metaKey;
      if (found) {
        if (addMode) {
          const i = engine.selection.indexOf(found);
          if (i === -1) engine.selection.push(found); else engine.selection.splice(i, 1);
        } else if (!isSel(found)) {
          engine.selection = [found];
        }
        if (isSel(found)) {
          engine.drag = { ox: p.x, oy: p.y, start: engine.selection.map((o) => ({ o, x: o.x, y: o.y })) };
          cv.setPointerCapture(e.pointerId);
          cv.style.cursor = 'grabbing';
        }
      } else {
        if (!addMode) engine.selection = [];
        engine.band = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, addMode };
        cv.setPointerCapture(e.pointerId);
      }
      draw();
    }

    function onPointerMove(e) {
      const p = pt(e);
      if (engine.band) { engine.band.x1 = p.x; engine.band.y1 = p.y; draw(); return; }
      if (!engine.drag) return;
      const T = TENTS[engine.tent.type];
      let dx = p.x - engine.drag.ox, dy = p.y - engine.drag.oy;
      if (!e.shiftKey) { dx = Math.round(dx / SNAP) * SNAP; dy = Math.round(dy / SNAP) * SNAP; }
      const b = bboxStart(engine.drag.start);
      dx = Math.max(-1 - b.x, Math.min(dx, engine.tent.len + 1 - (b.x + b.w)));
      dy = Math.max(-1 - b.y, Math.min(dy, T.w + 1 - (b.y + b.h)));
      engine.drag.start.forEach((s) => { s.o.x = round2(s.x + dx); s.o.y = round2(s.y + dy); });
      draw();
    }

    function onPointerUp() {
      if (engine.band) {
        const band = engine.band;
        const x0 = Math.min(band.x0, band.x1), x1 = Math.max(band.x0, band.x1);
        const y0 = Math.min(band.y0, band.y1), y1 = Math.max(band.y0, band.y1);
        if (Math.abs(x1 - x0) > 0.15 || Math.abs(y1 - y0) > 0.15) {
          const inside = engine.objs.filter((o) => {
            const d = dims(o);
            return o.x < x1 && o.x + d.w > x0 && o.y < y1 && o.y + d.h > y0;
          });
          engine.selection = band.addMode
            ? engine.selection.concat(inside.filter((o) => !isSel(o)))
            : inside;
        }
        engine.band = null;
      }
      engine.drag = null;
      cv.style.cursor = 'grab';
      draw();
    }

    function bboxStart(start) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      start.forEach((s) => {
        const d = dims(s.o);
        x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y);
        x1 = Math.max(x1, s.x + d.w); y1 = Math.max(y1, s.y + d.h);
      });
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    return () => {
      cv.removeEventListener('pointerdown', onPointerDown);
      cv.removeEventListener('pointermove', onPointerMove);
      cv.removeEventListener('pointerup', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDefs, customDefs]);

  // ---- Zeichnen (1:1 aus dem Original, inkl. dynamischer PX-Skalierung) --
  function draw() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const T = TENTS[engine.tent.type];
    const dpr = window.devicePixelRatio || 1;

    const availW = Math.max(320, (scrollerRef.current && scrollerRef.current.clientWidth) || 760);
    // EIN gemeinsamer Maßstab PX für X und Y — nie unabhängig setzen (Fallstrick Seite 189).
    const px = Math.max(6, Math.min((availW - 2 * PAD) / engine.tent.len, (640 - 2 * PAD) / T.w, 60));
    engine.px = px;

    const w = Math.round(engine.tent.len * px + 2 * PAD);
    const h = Math.round(T.w * px + 2 * PAD);

    // Fallstrick: CSS-Größe UND Attribut-Größe IMMER gemeinsam setzen.
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 1-m-Raster
    ctx.strokeStyle = '#eae6df'; ctx.lineWidth = 1;
    for (let x = 0; x <= engine.tent.len; x++) {
      ctx.beginPath(); ctx.moveTo(PAD + x * px, PAD); ctx.lineTo(PAD + x * px, PAD + T.w * px); ctx.stroke();
    }
    for (let y = 0; y <= T.w; y++) {
      ctx.beginPath(); ctx.moveTo(PAD, PAD + y * px); ctx.lineTo(PAD + engine.tent.len * px, PAD + y * px); ctx.stroke();
    }
    // Zeltabschnitte (Raster-Markierung)
    ctx.strokeStyle = '#c9c2b6'; ctx.setLineDash([5, 4]);
    for (let x = T.raster; x < engine.tent.len; x += T.raster) {
      ctx.beginPath(); ctx.moveTo(PAD + x * px, PAD); ctx.lineTo(PAD + x * px, PAD + T.w * px); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Hülle
    ctx.strokeStyle = '#4a453d'; ctx.lineWidth = 2.5;
    ctx.strokeRect(PAD, PAD, engine.tent.len * px, T.w * px);

    // Maße
    ctx.fillStyle = '#7a746b'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(engine.tent.len.toFixed(0) + ' m', PAD + (engine.tent.len * px) / 2, PAD - 12);
    ctx.save(); ctx.translate(PAD - 14, PAD + (T.w * px) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(T.w.toFixed(0) + ' m', 0, 0); ctx.restore();

    // Maßstabsbalken "1 m" — Dauerkontrolle gegen den Verzerrungs-Bug, nicht wegoptimieren
    const by = PAD + T.w * px + 16;
    ctx.strokeStyle = '#4a453d'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, by); ctx.lineTo(PAD + px, by);
    ctx.moveTo(PAD, by - 4); ctx.lineTo(PAD, by + 4);
    ctx.moveTo(PAD + px, by - 4); ctx.lineTo(PAD + px, by + 4);
    ctx.stroke();
    ctx.fillStyle = '#7a746b'; ctx.textAlign = 'left'; ctx.fillText('1 m', PAD + px + 6, by + 4);

    // Objekte
    engine.objs.forEach((o) => {
      const c = defBySlug(o.defSlug);
      if (!c) return;
      const d = dims(o);
      const X = PAD + o.x * px, Y = PAD + o.y * px, W = d.w * px, H = d.h * px;
      const out = o.x < -0.01 || o.y < -0.01 || o.x + d.w > engine.tent.len + 0.01 || o.y + d.h > T.w + 0.01;
      const ov = engine.objs.some((p2) => p2 !== o && hit(o, p2));

      ctx.fillStyle = c.farbe + '33'; ctx.fillRect(X, Y, W, H);
      ctx.strokeStyle = (out || ov) ? '#b3521f' : c.farbe + '88';
      ctx.lineWidth = (out || ov) ? 2 : 1;
      ctx.setLineDash((out || ov) ? [] : [3, 3]); ctx.strokeRect(X, Y, W, H); ctx.setLineDash([]);

      ctx.fillStyle = c.farbe;
      if (c.kern_d) {
        ctx.beginPath(); ctx.arc(X + W / 2, Y + H / 2, (Number(c.kern_d) / 2) * px, 0, Math.PI * 2); ctx.fill();
      } else if (c.kern_laenge && c.kern_tiefe) {
        const cw = (o.rot ? Number(c.kern_tiefe) : Number(c.kern_laenge)) * px;
        const ch = (o.rot ? Number(c.kern_laenge) : Number(c.kern_tiefe)) * px;
        ctx.fillRect(X + (W - cw) / 2, Y + (H - ch) / 2, cw, ch);
      } else {
        ctx.fillRect(X + 2, Y + 2, Math.max(1, W - 4), Math.max(1, H - 4));
      }
      if (isSel(o)) {
        ctx.strokeStyle = '#2b2926'; ctx.lineWidth = 2; ctx.strokeRect(X - 2, Y - 2, W + 4, H + 4);
      }
      if (c.personen > 0 && px > 18) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(c.personen, X + W / 2, Y + H / 2 + 3.5);
      }
    });

    // Auswahlrahmen der Gruppe
    if (engine.selection.length > 1) {
      const b = bbox(engine.selection);
      ctx.strokeStyle = '#2b2926'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.strokeRect(PAD + b.x * px - 5, PAD + b.y * px - 5, b.w * px + 10, b.h * px + 10);
      ctx.setLineDash([]);
    }
    // Gummiband
    if (engine.band) {
      const band = engine.band;
      const x = Math.min(band.x0, band.x1), y = Math.min(band.y0, band.y1);
      ctx.strokeStyle = '#8a6a3b'; ctx.fillStyle = '#8a6a3b1a'; ctx.lineWidth = 1;
      ctx.fillRect(PAD + x * px, PAD + y * px, Math.abs(band.x1 - band.x0) * px, Math.abs(band.y1 - band.y0) * px);
      ctx.strokeRect(PAD + x * px, PAD + y * px, Math.abs(band.x1 - band.x0) * px, Math.abs(band.y1 - band.y0) * px);
    }

    updateStatsUI();
  }

  // resize-Listener MUSS beim Unmount abgeräumt werden (Fallstrick).
  useEffect(() => {
    function onResize() { draw(); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Auswertung (1:1 Formeln aus zeltplaner.html, gegen die Referenzlayouts geprüft) ----
  function updateStatsUI() {
    const T = TENTS[engine.tent.type];
    const area = engine.tent.len * T.w;
    let pers = 0, sit = 0, used = 0;
    const warn = [];
    const bom = {};

    engine.objs.forEach((o) => {
      const c = defBySlug(o.defSlug);
      if (!c) return;
      const d = dims(o);
      if (c.personen !== null && c.personen !== undefined) pers += Number(c.personen);
      if (c.sitzplatz && c.personen !== null && c.personen !== undefined) sit += Number(c.personen);
      used += d.w * d.h;
      bom[c.name] = (bom[c.name] || 0) + 1;
    });

    if (engine.tent.len > T.recMax) warn.push({ level: 'w', text: `${engine.tent.len} m überschreitet die empfohlene Länge von ${T.recMax} m.` });
    const outCnt = engine.objs.filter((o) => {
      const d = dims(o);
      return o.x < -0.01 || o.y < -0.01 || o.x + d.w > engine.tent.len + 0.01 || o.y + d.h > T.w + 0.01;
    }).length;
    if (outCnt) warn.push({ level: 'w', text: `${outCnt} Objekt(e) ragen aus dem Zelt.` });
    const ovCnt = engine.objs.filter((o) => engine.objs.some((p2) => p2 !== o && hit(o, p2))).length;
    if (ovCnt) warn.push({ level: 'w', text: `${ovCnt} Objekt(e) überlappen sich.` });
    if (used / area > 0.55) warn.push({ level: 'w', text: 'Belegung über 55 % – Gänge und Servicewege werden knapp.' });
    if (sit) {
      const pp = area / sit;
      if (pp < 0.8) warn.push({ level: 'w', text: `${pp.toFixed(2)} m²/Sitzplatz – unter dem Richtwert 0,8 für Bierzeltgarnituren.` });
      else warn.push({ level: 'o', text: `${pp.toFixed(2)} m²/Sitzplatz – im plausiblen Bereich.` });
    }
    if (pers > sit) warn.push({ level: 'o', text: `${pers - sit} zusätzliche Stehplätze (Stehtische).` });
    if (!warn.length) warn.push({ level: 'o', text: 'Keine Auffälligkeiten.' });

    setStatsView({
      pers, sitz: sit, area: area.toFixed(0),
      pp: sit ? (area / sit).toFixed(2) : null,
      fill: Math.round((used / area) * 100),
      free: (area - used).toFixed(1),
    });
    setWarnMsgs(warn);
    setBomRows(Object.entries(bom));
    setSelInfo(
      engine.selection.length
        ? `${engine.selection.length}${engine.selection.length === 1 ? ' Objekt ausgewählt' : ' Objekte ausgewählt – werden gemeinsam verschoben, gedreht, dupliziert und gelöscht'}`
        : 'Nichts ausgewählt.'
    );
  }

  // ---- Export / Speichern / Laden -----------------------------------------
  function exportPng() {
    const cv = canvasRef.current;
    const tmp = document.createElement('canvas');
    tmp.width = cv.width; tmp.height = cv.height;
    const c2 = tmp.getContext('2d');
    c2.fillStyle = '#fff'; c2.fillRect(0, 0, tmp.width, tmp.height); c2.drawImage(cv, 0, 0);
    const a = document.createElement('a');
    a.download = `zeltplan_${engine.tent.type}_${engine.tent.len}m.png`;
    a.href = tmp.toDataURL('image/png');
    a.click();
  }

  function payload() {
    const usedSlugs = [...new Set(engine.objs.map((o) => o.defSlug))];
    return {
      tent: { type: engine.tent.type, len: engine.tent.len },
      objs: engine.objs.map((o) => ({ defSlug: o.defSlug, x: o.x, y: o.y, rot: o.rot })),
      defs: customDefs.filter((c) => usedSlugs.includes(c.slug)),
    };
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zeltplan_${engine.tent.type}_${engine.tent.len}m.json`;
    a.click();
  }

  function loadJsonFile(e) {
    // Portiert aus dem Original (document.getElementById("fi").onchange) — liest eine
    // lokal gespeicherte .json wieder ein, inkl. mitgelieferter eigener Objektdefinitionen.
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d.tent || !Array.isArray(d.objs)) throw new Error('Format');
        applyPayload(null, d.tent.type, d.tent.len, d.objs, d.defs);
      } catch (err) {
        console.error('[Zeltplaner] JSON laden fehlgeschlagen', err);
        setStatusMsg('Datei konnte nicht gelesen werden.');
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }

  async function saveAsReference() {
    if (!engine.objs.length) { setStatusMsg('Der Plan ist leer – es gibt nichts zu speichern.'); return; }
    if (!saveName.trim()) { setStatusMsg('Bitte einen Namen eingeben.'); return; }
    try {
      const p = payload();
      const res = await fetch('/api/zeltverleih/layouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), tent_type: p.tent.type, tent_len: p.tent.len, data: { objs: p.objs, defs: p.defs } }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatusMsg('Gespeichert.');
      setSaveName('');
      fetch('/api/zeltverleih/layouts', { credentials: 'include' }).then((r) => r.json()).then(setReferences);
    } catch (err) {
      console.error('[Zeltplaner] Speichern fehlgeschlagen', err);
      setStatusMsg('Speichern fehlgeschlagen.');
    }
  }

  function applyPayload(name, tentType, tentLen, objs, defs) {
    // Eigene Objektdefinitionen aus dem Layout ergänzen, falls lokal noch unbekannt
    // (analog applyPayload() im Original — Referenz lädt auch nach Löschen des Objekts noch).
    setCustomDefs((prev) => {
      const known = new Set(prev.map((d) => d.slug));
      const merged = [...prev];
      (defs || []).forEach((d) => { if (!known.has(d.slug)) merged.push(d); });
      return merged;
    });

    engine.tent = { type: tentType, len: tentLen };
    setTentUI({ type: tentType, len: tentLen });

    const knownSlugs = new Set(engine.CAT.map((c) => c.slug).concat((defs || []).map((d) => d.slug)));
    const missing = (objs || []).filter((o) => !knownSlugs.has(o.defSlug)).length;
    engine.objs = (objs || [])
      .filter((o) => knownSlugs.has(o.defSlug))
      .map((o) => ({ uid: engine.uid++, defSlug: o.defSlug, x: o.x, y: o.y, rot: o.rot || 0 }));
    engine.selection = [];
    draw();
    if (missing) setStatusMsg(`${missing} Objekt(e) konnten nicht geladen werden – zugehörige Objektdefinition fehlt.`);
    else setStatusMsg(name ? `Layout "${name}" geladen.` : 'Layout geladen.');
  }

  async function loadLayout(id) {
    try {
      const res = await fetch(`/api/zeltverleih/layouts/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const layout = await res.json();
      applyPayload(layout.name, layout.tent_type, Number(layout.tent_len), layout.data.objs, layout.data.defs);
    } catch (err) {
      console.error('[Zeltplaner] Laden fehlgeschlagen', err);
      setStatusMsg('Laden fehlgeschlagen.');
    }
  }

  // Ersetzt in Kategorie eine Definition per Slug, ODER entfernt sie, falls sie in eine
  // andere Kategorie verschoben wurde (Katalog ist nach Kategorie in zwei States getrennt,
  // siehe baseDefs/customDefs oben).
  function applyDefUpdate(updated, prevSlug) {
    const inBase = updated.kategorie !== 'eigene';
    setBaseDefs((prev) => {
      const rest = prev.filter((d) => d.slug !== prevSlug);
      return inBase ? [...rest, updated] : rest;
    });
    setCustomDefs((prev) => {
      const rest = prev.filter((d) => d.slug !== prevSlug);
      return !inBase ? [...rest, updated] : rest;
    });
  }

  async function submitObjectForm(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const kategorie = form.kategorie.value;
    const laenge = parseFloat(form.laenge.value);
    const tiefe = parseFloat(form.tiefe.value);
    const personenRaw = form.personen.value;
    const personen = personenRaw === '' ? 0 : parseInt(personenRaw, 10); // 0 ist gültig, nicht "kein Wert"
    const sitzplatz = form.sitzplatz.checked;
    const rund = form.rund.checked;
    const farbe = form.farbe.value || '#3f6f8f';
    const kernDRaw = form.kern_d.value;
    const kernLRaw = form.kern_laenge.value;
    const kernTRaw = form.kern_tiefe.value;
    const kern_d = kernDRaw === '' ? null : parseFloat(kernDRaw);
    const kern_laenge = kernLRaw === '' ? null : parseFloat(kernLRaw);
    const kern_tiefe = kernTRaw === '' ? null : parseFloat(kernTRaw);

    if (!name) { setStatusMsg('Bitte eine Bezeichnung eingeben.'); return; }
    if (!(laenge > 0) || !(tiefe > 0)) { setStatusMsg('Länge und Tiefe müssen größer als 0 sein.'); return; }

    const body = { name, kategorie, laenge, tiefe, personen, sitzplatz, rund, farbe, kern_d, kern_laenge, kern_tiefe };

    try {
      if (editingDef) {
        const res = await fetch(`/api/zeltverleih/objekte/${editingDef.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const saved = await res.json();
        const updated = {
          ...editingDef, name, kategorie, laenge, tiefe, personen,
          sitzplatz: !!sitzplatz, rund: !!rund, farbe,
          kern_d: saved.kern_d, kern_laenge: saved.kern_laenge, kern_tiefe: saved.kern_tiefe,
        };
        applyDefUpdate(updated, editingDef.slug);
        setStatusMsg(`"${name}" aktualisiert.`);
      } else {
        const slug = `cu_${Date.now().toString(36)}`;
        const res = await fetch('/api/zeltverleih/objekte', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, ...body }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        const newDef = {
          id: created.id, slug, name, kategorie: created.kategorie, laenge, tiefe, personen,
          sitzplatz: !!sitzplatz, rund: !!rund, farbe,
          kern_d: created.kern_d, kern_laenge: created.kern_laenge, kern_tiefe: created.kern_tiefe,
        };
        if (newDef.kategorie === 'eigene') setCustomDefs((prev) => [...prev, newDef]);
        else setBaseDefs((prev) => [...prev, newDef]);
        // sofort platzieren, wie addCustom() im Original
        setTimeout(() => addObj(slug), 0);
        setStatusMsg(`"${name}" angelegt.`);
      }
      form.reset();
      setShowAddForm(false);
      setEditingDef(null);
    } catch (err) {
      console.error('[Zeltplaner] Objekt speichern fehlgeschlagen', err);
      setStatusMsg('Objekt konnte nicht gespeichert werden.');
    }
  }

  function startEdit(def) {
    setEditingDef(def);
    setShowAddForm(true);
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingDef(null);
  }

  async function deleteCustomObject(def) {
    const inUse = engine.objs.some((o) => o.defSlug === def.slug);
    if (inUse && !window.confirm('Dieses Objekt ist im Plan verwendet. Objekt und alle Vorkommen löschen?')) return;
    try {
      await fetch(`/api/zeltverleih/objekte/${def.id}`, { method: 'DELETE', credentials: 'include' });
      if (inUse) {
        engine.objs = engine.objs.filter((o) => o.defSlug !== def.slug);
        engine.selection = engine.selection.filter((o) => o.defSlug !== def.slug);
      }
      setCustomDefs((prev) => prev.filter((c) => c.slug !== def.slug));
      draw();
    } catch (err) {
      console.error('[Zeltplaner] Objekt deaktivieren fehlgeschlagen', err);
      setStatusMsg('Objekt konnte nicht entfernt werden.');
    }
  }

  const grouped = {
    Bestuhlung: baseDefs.filter((d) => d.kategorie === 'bestuhlung'),
    Technik: baseDefs.filter((d) => d.kategorie === 'technik'),
    Eigene: customDefs,
  };

  return (
    <div className="zp-root">
      <style>{`
        .zp-root{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2926}
        .zp-wrap{display:flex;gap:16px;padding:16px;align-items:flex-start;flex-wrap:wrap}
        .zp-side{width:290px;flex-shrink:0;display:flex;flex-direction:column;gap:14px}
        .zp-card{background:#fff;border:1px solid #d9d4cb;border-radius:8px;padding:14px}
        .zp-card h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#7a746b;margin:0 0 10px}
        .zp-card label{display:block;font-size:12px;color:#7a746b;margin:8px 0 3px}
        .zp-card select,.zp-card input[type=number],.zp-card input[type=text]{width:100%;padding:6px 8px;border:1px solid #d9d4cb;border-radius:5px;background:#fff;font:inherit}
        .zp-card input[type=range]{width:100%}
        .zp-card input[type=color]{width:100%;height:30px;padding:2px;border:1px solid #d9d4cb;border-radius:5px;background:#fff}
        .zp-row{display:flex;gap:8px}
        .zp-row>div{flex:1}
        .zp-chk{display:flex;align-items:center;gap:6px;font-size:12px;color:#7a746b;margin-top:8px}
        .zp-pal{display:flex;flex-direction:column;gap:5px}
        .zp-pal button,.zp-itm{display:flex;align-items:center;gap:9px;text-align:left;padding:7px 9px;border:1px solid #d9d4cb;border-radius:6px;background:#fff;cursor:pointer;font:inherit;width:100%}
        .zp-pal button:hover{border-color:#8a6a3b;background:#fdfbf7}
        .zp-sw{width:14px;height:14px;border-radius:3px;flex-shrink:0}
        .zp-nm{flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .zp-dim{font-size:10.5px;color:#7a746b;font-variant-numeric:tabular-nums;flex-shrink:0}
        .zp-grp{display:flex;align-items:center;gap:4px}
        .zp-catlab{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#7a746b;margin:8px 0 2px}
        .zp-del{width:24px;min-width:24px;flex:0 0 24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;border:1px solid #d9d4cb;border-radius:5px;background:#fff;color:#7a746b;cursor:pointer;font-size:14px;line-height:1}
        .zp-del:hover{color:#b3521f;border-color:#b3521f;background:#fdf1ea}
        .zp-stage{flex:1;min-width:420px;background:#fff;border:1px solid #d9d4cb;border-radius:8px;padding:12px}
        .zp-scroller{overflow-x:auto}
        .zp-stage canvas{display:block;cursor:grab;touch-action:none}
        .zp-bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
        .zp-bar button{padding:6px 11px;border:1px solid #d9d4cb;border-radius:6px;background:#fff;cursor:pointer;font:inherit;font-size:12.5px}
        .zp-bar button:hover{border-color:#8a6a3b}
        .zp-bar .zp-prim{border-color:#8a6a3b;background:#fdf8f0}
        .zp-selinfo{font-size:12px;color:#7a746b;margin-top:8px}
        .zp-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:4px}
        .zp-stat{border-bottom:1px dotted #d9d4cb;padding-bottom:5px}
        .zp-stat .v{font-size:19px;font-variant-numeric:tabular-nums;font-weight:600}
        .zp-stat .k{font-size:10.5px;color:#7a746b;text-transform:uppercase;letter-spacing:.05em}
        .zp-msgs{margin-top:10px;display:flex;flex-direction:column;gap:5px}
        .zp-msg{font-size:12px;padding:6px 9px;border-radius:5px;border-left:3px solid}
        .zp-msg.w{background:#fdf1ea;border-color:#b3521f;color:#7d3a14}
        .zp-msg.o{background:#eef4ef;border-color:#3d6b45;color:#2c4f33}
        .zp-hint{font-size:11.5px;color:#7a746b;margin-top:8px;line-height:1.5}
        .zp-lst{width:100%;border-collapse:collapse;font-size:12px}
        .zp-lst td{padding:3px 0;border-bottom:1px dotted #d9d4cb}
        .zp-lst td:last-child{text-align:right;font-variant-numeric:tabular-nums;color:#7a746b}
      `}</style>

      <div className="zp-wrap">
        <div className="zp-side">
          <div className="zp-card">
            <h2>Zelt</h2>
            <label>Zelttyp</label>
            <select value={tentUI.type} onChange={(e) => handleTentTypeChange(e.target.value)}>
              {Object.entries(TENTS).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
            </select>
            <label>Länge {tentUI.len} m × {TENTS[tentUI.type].w} m Breite</label>
            <input
              type="range"
              min={TENTS[tentUI.type].min}
              max={TENTS[tentUI.type].techMax}
              step={TENTS[tentUI.type].raster}
              value={tentUI.len}
              onChange={(e) => handleTentLenChange(+e.target.value)}
            />
            <div className="zp-hint">{TENTS[tentUI.type].hint}</div>
          </div>

          <div className="zp-card">
            <h2>Ausstattung hinzufügen</h2>
            <div className="zp-pal">
              {Object.entries(grouped).map(([cat, items]) => items.length > 0 && (
                <React.Fragment key={cat}>
                  <div className="zp-catlab">{cat}</div>
                  {items.map((c) => (
                    <div className="zp-grp" key={c.slug}>
                      <button onClick={() => addObj(c.slug)}>
                        <span className="zp-sw" style={{ background: c.farbe }} />
                        <span className="zp-nm">{esc(c.name)}</span>
                        <span className="zp-dim">{Number(c.laenge).toFixed(2)}×{Number(c.tiefe).toFixed(2)}</span>
                      </button>
                      <button className="zp-del" title="Objekt bearbeiten" onClick={() => startEdit(c)}>✎</button>
                      {cat === 'Eigene' && (
                        <button className="zp-del" title="Objekt löschen" onClick={() => deleteCustomObject(c)}>×</button>
                      )}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <div className="zp-hint">
              Klick = hinzufügen.<br />
              <b>Ziehen</b> verschiebt · <b>Shift+Klick</b> zur Auswahl hinzufügen ·{' '}
              <b>Rahmen ziehen</b> auf freier Fläche wählt mehrere · <b>Strg+A</b> alle ·{' '}
              <b>R</b> drehen · <b>D</b> duplizieren · <b>Entf</b> löschen · <b>Shift</b> beim Ziehen = ohne Raster
            </div>
          </div>

          <div className="zp-card">
            <h2>{editingDef ? `Objekt bearbeiten — ${esc(editingDef.name)}` : 'Objekt anlegen'}</h2>
            {!showAddForm ? (
              <button onClick={() => setShowAddForm(true)} style={{ width: '100%', padding: 8 }}>+ Objekt anlegen</button>
            ) : (
              <form onSubmit={submitObjectForm} key={editingDef ? editingDef.id : 'new'}>
                <label>Bezeichnung</label>
                <input name="name" type="text" placeholder="z. B. Cocktailbar" defaultValue={editingDef?.name || ''} required />
                <label>Kategorie</label>
                <select name="kategorie" defaultValue={editingDef?.kategorie || 'eigene'}>
                  <option value="bestuhlung">Bestuhlung</option>
                  <option value="technik">Technik</option>
                  <option value="eigene">Eigene</option>
                </select>
                <div className="zp-row">
                  <div><label>Länge (m)</label><input name="laenge" type="number" defaultValue={editingDef?.laenge ?? '2.00'} step="0.05" min="0.2" /></div>
                  <div><label>Tiefe (m)</label><input name="tiefe" type="number" defaultValue={editingDef?.tiefe ?? '1.00'} step="0.05" min="0.2" /></div>
                </div>
                <div className="zp-row">
                  <div><label>Personen</label><input name="personen" type="number" defaultValue={editingDef?.personen ?? '0'} step="1" min="0" /></div>
                  <div><label>Farbe</label><input name="farbe" type="color" defaultValue={editingDef?.farbe || '#3f6f8f'} /></div>
                </div>
                <div className="zp-chk"><input name="sitzplatz" type="checkbox" id="zpSit" defaultChecked={!!editingDef?.sitzplatz} /><label htmlFor="zpSit" style={{ margin: 0 }}>zählt als Sitzplätze</label></div>
                <div className="zp-chk"><input name="rund" type="checkbox" id="zpRound" defaultChecked={!!editingDef?.rund} /><label htmlFor="zpRound" style={{ margin: 0 }}>runde Darstellung</label></div>
                <div className="zp-row">
                  <div><label>Kern-Ø, rund (m)</label><input name="kern_d" type="number" defaultValue={editingDef?.kern_d ?? ''} step="0.05" min="0" placeholder="leer = automatisch" /></div>
                </div>
                <div className="zp-row">
                  <div><label>Kern-Länge, eckig (m)</label><input name="kern_laenge" type="number" defaultValue={editingDef?.kern_laenge ?? ''} step="0.05" min="0" placeholder="leer = kein Kern" /></div>
                  <div><label>Kern-Tiefe, eckig (m)</label><input name="kern_tiefe" type="number" defaultValue={editingDef?.kern_tiefe ?? ''} step="0.05" min="0" placeholder="leer = kein Kern" /></div>
                </div>
                <div className="zp-hint">
                  Kernform = die innere Fläche, die im Objekt gezeichnet wird (z. B. echte Tischplatte).
                  Bei "runde Darstellung" zählt nur Kern-Ø (leer = automatisch 80&nbsp;% der kleineren Seite),
                  sonst Kern-Länge/-Tiefe (leer = einfaches Inset ohne eigene Kernform).
                </div>
                <div className="zp-bar">
                  <button type="submit" className="zp-prim">{editingDef ? 'Änderungen speichern' : 'Objekt anlegen'}</button>
                  <button type="button" onClick={cancelForm}>Abbrechen</button>
                </div>
              </form>
            )}
            <div className="zp-hint">Änderungen werden im Portal gespeichert (MariaDB) und sind für alle mit Zeltverleih-Zugriff sichtbar — auch bei den zehn Grundobjekten.</div>
          </div>
        </div>

        <div className="zp-stage">
          <div className="zp-scroller" ref={scrollerRef}>
            <canvas ref={canvasRef} />
          </div>
          <div className="zp-bar">
            <button onClick={rotateSel}>Drehen (R)</button>
            <button onClick={dupSel}>Duplizieren (D)</button>
            <button onClick={delSel}>Löschen (Entf)</button>
            <button onClick={selectAllFn}>Alle wählen</button>
            <button onClick={clearSelFn}>Auswahl aufheben</button>
            <button onClick={clearAllFn}>Plan leeren</button>
          </div>
          <div className="zp-bar">
            <button onClick={exportPng}>PNG exportieren</button>
            <button onClick={exportJson}>Als JSON-Datei speichern</button>
            <button onClick={() => fileInputRef.current?.click()}>JSON laden</button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={loadJsonFile}
            />
            <input
              placeholder="Name für Referenz"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              style={{ width: 160, padding: '6px 8px', border: '1px solid #d9d4cb', borderRadius: 6 }}
            />
            <button className="zp-prim" onClick={saveAsReference}>Zu Referenzen hinzufügen</button>
          </div>
          <div className="zp-selinfo">{selInfo}{statusMsg ? ` · ${statusMsg}` : ''}</div>
        </div>

        <div className="zp-side">
          <div className="zp-card">
            <h2>Auswertung</h2>
            <div className="zp-stats">
              <div className="zp-stat"><div className="v">{statsView.pers}</div><div className="k">Personen</div></div>
              <div className="zp-stat"><div className="v">{statsView.sitz}</div><div className="k">davon sitzend</div></div>
              <div className="zp-stat"><div className="v">{statsView.area}</div><div className="k">Zeltfläche m²</div></div>
              <div className="zp-stat"><div className="v">{statsView.pp !== null ? statsView.pp : '–'}</div><div className="k">m² / Sitzplatz</div></div>
              <div className="zp-stat"><div className="v">{statsView.fill} %</div><div className="k">Belegung</div></div>
              <div className="zp-stat"><div className="v">{statsView.free}</div><div className="k">Freifläche m²</div></div>
            </div>
            <div className="zp-msgs">
              {warnMsgs.map((m, i) => <div key={i} className={`zp-msg ${m.level}`}>{m.text}</div>)}
            </div>
          </div>

          <div className="zp-card">
            <h2>Referenz-Layouts</h2>
            <div className="zp-pal">
              {references.map((r) => (
                <button key={r.id} onClick={() => loadLayout(r.id)}>
                  <span className="zp-nm">{r.is_reference ? '★ ' : ''}{r.name}</span>
                  <span className="zp-dim">{r.tent_len}×{TENTS[r.tent_type] ? TENTS[r.tent_type].w : '?'}</span>
                </button>
              ))}
            </div>
            <div className="zp-hint">Werkseitige Referenzen aus echten Angeboten plus eigene, die du über „Zu Referenzen hinzufügen" ablegst.</div>
          </div>

          <div className="zp-card">
            <h2>Stückliste</h2>
            <table className="zp-lst"><tbody>
              {bomRows.length
                ? bomRows.map(([name, count]) => <tr key={name}><td>{esc(name)}</td><td>{count}×</td></tr>)
                : <tr><td colSpan="2" style={{ color: '#7a746b' }}>noch leer</td></tr>}
            </tbody></table>
          </div>

          <div className="zp-card">
            <h2>Richtwerte</h2>
            <div className="zp-hint">
              Gang / Rettungsweg min. <b>1,20 m</b>.<br />
              Tisch zu Tisch min. <b>1,50 m</b>.<br />
              Weg vom Platz zum Gang max. <b>10 m</b>.<br />
              Flächenbedarf: stehend 0,5 · Bierzeltgarnitur 0,8 · Bankett 1,2 · Rundtisch Gala ca. 2,0 m²/Person.<br />
              <span style={{ color: '#7a746b' }}>Planungsrichtwerte (MVStättV-Logik); Zelte dieser Größe sind Fliegende Bauten.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
