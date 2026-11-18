'use strict';
// Hinweisbalken randl.group: Validierung + Zeitlogik (reine Funktionen)

const STYLES   = ['rot', 'dunkel', 'hell'];
const MAX_BADGE = 20;
const MAX_TEXT  = 160;
const MAX_LABEL = 40;
const MAX_URL   = 300;

function defaultBanner() {
  return {
    version: 1, enabled: false, badge: '', text: '', linkUrl: '', linkLabel: '',
    style: 'rot', startAt: null, endAt: null, updatedAt: null, updatedBy: null,
  };
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function hasHtml(s) {
  return /[<>]/.test(s) || /[\u0000-\u001f]/.test(s);
}

function validUrl(u) {
  if (u === '') return true;
  if (u.length > MAX_URL || /\s/.test(u) || hasHtml(u)) return false;
  if (u.startsWith('//')) return false;
  if (u.startsWith('/')) return !u.includes('\\');
  return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(u);
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false };
  const t = Date.parse(v);
  if (Number.isNaN(t)) return { ok: false };
  return { ok: true, value: new Date(t).toISOString() };
}

// Gibt { ok, errors, value } zurück; value ist bereinigt und nur bei ok gültig.
function validateBanner(input) {
  const errors = [];
  const src = input && typeof input === 'object' ? input : {};
  const badge = str(src.badge);
  const text = str(src.text);
  const linkUrl = str(src.linkUrl);
  const linkLabel = str(src.linkLabel);
  const style = src.style === undefined || src.style === '' ? 'rot' : src.style;
  const enabled = src.enabled === true;

  if (typeof src.enabled !== 'boolean') errors.push('enabled muss true oder false sein');
  if (!STYLES.includes(style)) errors.push('Ungültiger Stil');
  if (badge.length > MAX_BADGE) errors.push(`Badge: max. ${MAX_BADGE} Zeichen`);
  if (text.length > MAX_TEXT) errors.push(`Text: max. ${MAX_TEXT} Zeichen`);
  if (linkLabel.length > MAX_LABEL) errors.push(`Link-Text: max. ${MAX_LABEL} Zeichen`);
  if (hasHtml(badge) || hasHtml(text) || hasHtml(linkLabel)) errors.push('Kein HTML erlaubt');
  if (enabled && !text) errors.push('Text ist Pflicht, wenn der Balken eingeschaltet ist');
  if (!validUrl(linkUrl)) errors.push('Link-Ziel: nur /pfad oder https://…');
  if (linkLabel && !linkUrl) errors.push('Link-Text ohne Link-Ziel');

  const start = parseDate(src.startAt);
  const end = parseDate(src.endAt);
  if (!start.ok) errors.push('Ungültiges Startdatum');
  if (!end.ok) errors.push('Ungültiges Enddatum');
  if (start.ok && end.ok && start.value && end.value && Date.parse(end.value) <= Date.parse(start.value)) {
    errors.push('Ende muss nach dem Start liegen');
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      version: 1, enabled, badge, text, linkUrl, linkLabel, style,
      startAt: start.value, endAt: end.value,
    },
  };
}

function isActive(cfg, now = new Date()) {
  if (!cfg || cfg.enabled !== true || !cfg.text) return false;
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (cfg.startAt && Date.parse(cfg.startAt) > t) return false;
  if (cfg.endAt && Date.parse(cfg.endAt) <= t) return false;
  return true;
}

module.exports = { validateBanner, isActive, defaultBanner, STYLES, MAX_BADGE, MAX_TEXT, MAX_LABEL };
