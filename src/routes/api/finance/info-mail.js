// Info-Mail an die Gaskunden zum Shop-Rollout (#319). Gemountet unter
// /api/finance/info-mail mit requireArea('gashandel').
// Vorlage und PDF-Anleitung liegen in shop-content/info-mail/ (nicht in Git, nachts gesichert);
// Versand und Protokoll macht das admin-backend (Microsoft Graph wie der Shop).
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { shopFetch } = require('./shopClient');
const { getPool } = require('../../../db');
const { CONTENT_DIR, readJson, writeAtomic } = require('../../../utils/shopContent');

const DIR = path.join(CONTENT_DIR, 'info-mail');
const TEMPLATE = path.join(DIR, 'vorlage.json');
const PDF = path.join(DIR, 'anleitung.pdf');
const PDF_MAX = 2.5 * 1024 * 1024;   // Graph sendMail: ca. 4 MB je Anfrage inkl. Base64

const DEFAULT_TEMPLATE = {
  subject: 'Unser neuer Gas-Onlineshop – Ihre Zugangsdaten',
  html: '<p>Guten Tag {{name}},</p>\n<p>ab sofort können Sie Ihre Gasflaschen bequem online bestellen.</p>\n'
    + '<p><strong>Ihre Kundennummer:</strong> {{kundennummer}}<br>\n'
    + '<strong>Direkt anmelden:</strong> <a href="{{login_link}}">{{login_link}}</a></p>\n'
    + '<p>Eine Anleitung finden Sie im Anhang.</p>\n<p>Freundliche Grüße<br>Ihr Randl-Gashandel</p>',
  letter: '',
};

function userName(req) {
  const u = req.session.user || {};
  return u.fullName || u.username || null;
}

function template() {
  return { ...DEFAULT_TEMPLATE, ...(readJson(TEMPLATE) || {}) };
}

function pdfInfo() {
  try { const st = fs.statSync(PDF); return { exists: true, size: st.size, updated_at: st.mtime }; }
  catch { return { exists: false }; }
}

// Im Portal ausgeblendete Kunden (customer_exclusions) nicht anschreiben
async function excludedIds() {
  try {
    const [rows] = await getPool().execute('SELECT customer_id FROM customer_exclusions');
    return new Set(rows.map(r => r.customer_id));
  } catch { return new Set(); }
}

async function recipients(wave) {
  const upstream = await shopFetch('/admin/info-mail/recipients?wave=' + encodeURIComponent(wave));
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw Object.assign(new Error(data.error || 'Shop-API Fehler'), { status: upstream.status });
  const ex = await excludedIds();
  const customers = (data.customers || []).filter(c => !ex.has(c.id));
  return { ...data, customers, total: customers.length, sent: customers.filter(c => c.sent_at).length };
}

router.get('/template', (req, res) => {
  res.json({ ...template(), pdf: pdfInfo() });
});

router.put('/template', (req, res) => {
  const { subject, html, letter } = req.body || {};
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200) return res.status(400).json({ error: 'Betreff fehlt oder ist zu lang' });
  if (typeof html !== 'string' || !html.trim() || html.length > 20000) return res.status(400).json({ error: 'Mailtext fehlt oder ist zu lang' });
  const t = { subject: subject.trim(), html, letter: typeof letter === 'string' ? letter.slice(0, 20000) : '', updated_by: userName(req), updated_at: new Date().toISOString() };
  writeAtomic(TEMPLATE, JSON.stringify(t, null, 2) + '\n');
  res.json({ ...t, pdf: pdfInfo() });
});

router.post('/pdf', express.raw({ type: 'application/pdf', limit: '3mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 5 || buf.subarray(0, 5).toString() !== '%PDF-') return res.status(400).json({ error: 'Keine PDF-Datei' });
  if (buf.length > PDF_MAX) return res.status(400).json({ error: 'PDF zu groß (max. 2,5 MB)' });
  writeAtomic(PDF, buf);
  res.json({ pdf: pdfInfo() });
});

router.get('/pdf', (req, res) => {
  if (!pdfInfo().exists) return res.status(404).json({ error: 'Keine Anleitung hochgeladen' });
  res.type('application/pdf').sendFile(PDF);
});

router.get('/recipients', async (req, res) => {
  try { res.json(await recipients(req.query.wave)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// { wave, test_to? } – Vorlage, PDF und (gefilterte) Empfänger kommen von hier
router.post('/send', async (req, res) => {
  const { wave, test_to } = req.body || {};
  try {
    const t = template();
    const pdf = pdfInfo();
    const body = {
      wave, test_to: test_to || undefined, user: userName(req),
      subject: t.subject, html: t.html,
      attachment: pdf.exists ? { name: 'Anleitung-Gasshop.pdf', base64: fs.readFileSync(PDF).toString('base64') } : undefined,
    };
    if (!test_to) body.customerIds = (await recipients(wave)).customers.map(c => c.id);
    const upstream = await shopFetch('/admin/info-mail/send', { method: 'POST', body: JSON.stringify(body) });
    res.status(upstream.status).json(await upstream.json().catch(() => ({})));
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const upstream = await shopFetch('/admin/info-mail/jobs/' + encodeURIComponent(req.params.id));
    res.status(upstream.status).json(await upstream.json().catch(() => ({})));
  } catch (err) { res.status(500).json({ error: 'Shop-API nicht erreichbar' }); }
});

module.exports = router;
