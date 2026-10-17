/**
 * Dateien und Fotos pro Vorgang (#372, Entscheidung 6): Ablage im Portal, keine Nextcloud.
 *
 * Ordner: METALL_UPLOAD_DIR (aus der .env, ausserhalb von public_html), darin ein Unterordner
 * pro Vorgang mit der Vorgangsnummer – lesbar, damit sich der Ordner 1:1 auf den Proxmox
 * spiegeln laesst:
 *   <METALL_UPLOAD_DIR>/V-26-0012/2026-10-17_143012_Gelaender.jpg
 *   <METALL_UPLOAD_DIR>/V-26-0012/.vorschau/2026-10-17_143012_Gelaender.jpg   (nur Fotos)
 *   <METALL_UPLOAD_DIR>/V-26-0012/_geloescht/…                                 (weich geloescht)
 *   <METALL_UPLOAD_DIR>/.tmp/                                                  (multer, vor dem Verschieben)
 *
 * Erlaubt sind nur bekannte Endungen (Fotos, PDF, DXF/DWG/STEP), der MIME-Typ kommt aus der
 * Endung, nicht vom Browser. Fotos und PDFs werden zusaetzlich an den ersten Bytes geprueft.
 * Standard ist „nur intern“; der Kunde sieht nur fuer_kunde_sichtbar = 1 (metallKundenApi).
 * Kunden-Uploads (#376) sind fuer den Kunden selbst sichtbar (Entscheidung #361).
 */

const fs = require('fs/promises');
const path = require('path');

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DATEIEN = 20;
const VORSCHAU_PX = 640;
const BESCHREIBUNG_MAX = 500;
const NUMMER_RE = /^V-\d{2}-\d{4,}$/;

// Endung → [art, MIME, Pruefung der ersten Bytes]
const JPEG = b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const PNG = b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const WEBP = b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
const HEIF = b => b.subarray(4, 8).toString('latin1') === 'ftyp';
const PDF = b => b.subarray(0, 5).toString('latin1') === '%PDF-';
const TYPEN = {
  jpg: ['foto', 'image/jpeg', JPEG],
  jpeg: ['foto', 'image/jpeg', JPEG],
  png: ['foto', 'image/png', PNG],
  webp: ['foto', 'image/webp', WEBP],
  heic: ['foto', 'image/heic', HEIF],
  heif: ['foto', 'image/heif', HEIF],
  pdf: ['pdf', 'application/pdf', PDF],
  dxf: ['cad', 'image/vnd.dxf', null],
  dwg: ['cad', 'image/vnd.dwg', null],
  step: ['cad', 'model/step', null],
  stp: ['cad', 'model/step', null],
};
// Im Browser direkt anzeigen; alles andere als Download
const INLINE = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function fehler(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const idOder404 = (wert, was) => {
  const n = Number(wert);
  if (!Number.isInteger(n) || n <= 0) throw fehler(404, `${was} nicht gefunden`);
  return n;
};

function basisOrdner() {
  const dir = process.env.METALL_UPLOAD_DIR;
  if (!dir || !path.isAbsolute(dir)) throw fehler(503, 'Dateiablage nicht eingerichtet (METALL_UPLOAD_DIR)');
  return dir;
}

/** Pfad relativ zum Ablageordner aufloesen; nie ausserhalb (Schutz gegen ../) */
function absolut(rel) {
  const basis = path.resolve(basisOrdner());
  const abs = path.resolve(basis, String(rel || ''));
  if (!abs.startsWith(basis + path.sep)) throw fehler(404, 'Datei nicht gefunden');
  return abs;
}

/** Typ aus der Endung: { art, mime, pruefe } oder null */
function typAus(dateiname) {
  // nicht path.extname: „.pdf“ gilt dort als Datei ohne Endung
  const ext = (/\.([^./\\]+)$/.exec(String(dateiname || '')) || [])[1]?.toLowerCase() || '';
  const t = TYPEN[ext];
  return t ? { ext, art: t[0], mime: t[1], pruefe: t[2] } : null;
}

/**
 * Lesbarer, sicherer Dateiname: Umlaute bleiben, Pfadzeichen und Steuerzeichen werden zu „_“,
 * Zeitstempel davor (Reihenfolge im Ordner = Upload-Reihenfolge). Endung klein.
 */
function sichererName(original, jetzt = new Date()) {
  const t = typAus(original);
  const roh = path.basename(String(original || '').replace(/\\/g, '/'));
  let stamm = roh.slice(0, roh.length - (t ? t.ext.length + 1 : 0))
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()+-]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '')
    .slice(0, 120);
  if (!stamm) stamm = 'Datei';
  const z = n => String(n).padStart(2, '0');
  const stempel = `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}_${z(jetzt.getHours())}${z(jetzt.getMinutes())}${z(jetzt.getSeconds())}`;
  return `${stempel}_${stamm}.${t ? t.ext : 'bin'}`;
}

/** Content-Disposition mit Umlauten (RFC 5987) */
function disposition(dateiname, inline) {
  const ascii = String(dateiname).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`;
}

async function ladeVorgang(pool, vorgangId) {
  const [[v]] = await pool.execute('SELECT id, vorgangsnummer FROM metall_vorgang WHERE id = ?', [idOder404(vorgangId, 'Vorgang')]);
  if (!v) throw fehler(404, 'Vorgang nicht gefunden');
  if (!NUMMER_RE.test(v.vorgangsnummer)) throw fehler(500, 'Ungültige Vorgangsnummer');
  return v;
}

/** Freier Name im Ordner (bei gleicher Sekunde und gleichem Namen „-2“, „-3“ …) */
async function freierName(ordner, name) {
  const ext = path.extname(name);
  const stamm = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 100; i++) {
    const kandidat = i === 1 ? name : `${stamm}-${i}${ext}`;
    try { await fs.access(path.join(ordner, kandidat)); } catch { return kandidat; }
  }
  throw fehler(409, 'Kein freier Dateiname');
}

/** Vorschaubild fuer Fotos (gedreht nach EXIF, max. 640 px). Ohne sharp oder bei HEIC: keins. */
async function baueVorschau(quelle, ziel) {
  try {
    const sharp = require('sharp');
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    await sharp(quelle).rotate().resize(VORSCHAU_PX, VORSCHAU_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78 }).toFile(ziel);
    return true;
  } catch (err) {
    console.warn('[Metall-Dateien] Keine Vorschau fuer', path.basename(quelle) + ':', err.message);
    return false;
  }
}

async function ersteBytes(datei) {
  const fh = await fs.open(datei, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

/**
 * Hochgeladene Dateien (multer, schon in .tmp) pruefen, in den Vorgangsordner verschieben und
 * eintragen. dateien: [{ path, originalname, size }]. Ungueltige Dateien werden uebersprungen und
 * gemeldet, die anderen gespeichert. Temporaere Dateien werden immer entfernt.
 * Ergebnis: { gespeichert: [{ id, dateiname }], abgelehnt: [{ dateiname, grund }] }
 */
async function speichere(pool, vorgangId, dateien, { employeeId = null, quelle = 'mitarbeiter', jetzt = new Date() } = {}) {
  const liste = Array.isArray(dateien) ? dateien : [];
  try {
    if (!liste.length) throw fehler(400, 'Keine Datei ausgewählt');
    if (liste.length > MAX_DATEIEN) throw fehler(400, `Höchstens ${MAX_DATEIEN} Dateien auf einmal`);
    const v = await ladeVorgang(pool, vorgangId);
    const ordner = absolut(v.vorgangsnummer);
    await fs.mkdir(ordner, { recursive: true });

    const gespeichert = [], abgelehnt = [];
    for (const d of liste) {
      const anzeige = path.basename(String(d.originalname || 'Datei').replace(/\\/g, '/')).slice(0, 255);
      const t = typAus(anzeige);
      if (!t) { abgelehnt.push({ dateiname: anzeige, grund: 'Dateityp nicht erlaubt' }); continue; }
      if (!(d.size > 0)) { abgelehnt.push({ dateiname: anzeige, grund: 'Datei ist leer' }); continue; }
      if (d.size > MAX_BYTES) { abgelehnt.push({ dateiname: anzeige, grund: 'größer als 25 MB' }); continue; }
      if (t.pruefe && !t.pruefe(await ersteBytes(d.path))) { abgelehnt.push({ dateiname: anzeige, grund: 'Inhalt passt nicht zur Endung' }); continue; }

      const name = await freierName(ordner, sichererName(anzeige, jetzt));
      const ziel = path.join(ordner, name);
      await fs.rename(d.path, ziel);
      const rel = `${v.vorgangsnummer}/${name}`;
      let vorschau = null;
      if (t.art === 'foto') {
        const vRel = `${v.vorgangsnummer}/.vorschau/${name.replace(/\.[^.]+$/, '')}.jpg`;
        if (await baueVorschau(ziel, absolut(vRel))) vorschau = vRel;
      }
      try {
        const [res] = await pool.execute(
          `INSERT INTO metall_datei
             (vorgang_id, art, dateiname, pfad, vorschau_pfad, mime_typ, groesse_bytes, fuer_kunde_sichtbar, quelle, hochgeladen_von)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [v.id, t.art, anzeige, rel, vorschau, t.mime, d.size, quelle === 'kunde' ? 1 : 0, quelle, quelle === 'kunde' ? null : employeeId]
        );
        gespeichert.push({ id: res.insertId, dateiname: anzeige });
      } catch (err) {
        await fs.rm(ziel, { force: true });
        if (vorschau) await fs.rm(absolut(vorschau), { force: true });
        throw err;
      }
    }
    return { gespeichert, abgelehnt };
  } finally {
    await Promise.all(liste.map(d => d.path && fs.rm(d.path, { force: true }).catch(() => {})));
  }
}

/** Dateien eines Vorgangs fuers Buero (ohne geloeschte) */
async function liste(pool, vorgangId) {
  const v = await ladeVorgang(pool, vorgangId);
  const [rows] = await pool.execute(
    `SELECT d.id, d.art, d.dateiname, d.mime_typ, d.groesse_bytes, d.beschreibung, d.fuer_kunde_sichtbar,
            d.quelle, d.hochgeladen_am, d.sichtbar_geaendert_am, d.vorschau_pfad IS NOT NULL AS vorschau,
            hv.full_name AS hochgeladen_von_name, sv.full_name AS sichtbar_geaendert_von_name
     FROM metall_datei d
     LEFT JOIN employees hv ON hv.id = d.hochgeladen_von
     LEFT JOIN employees sv ON sv.id = d.sichtbar_geaendert_von
     WHERE d.vorgang_id = ? AND d.geloescht_am IS NULL
     ORDER BY d.hochgeladen_am DESC, d.id DESC`,
    [v.id]
  );
  return rows.map(r => ({ ...r, fuer_kunde_sichtbar: !!r.fuer_kunde_sichtbar, vorschau: !!r.vorschau }));
}

async function ladeDatei(pool, id) {
  const [[d]] = await pool.execute('SELECT * FROM metall_datei WHERE id = ? AND geloescht_am IS NULL', [idOder404(id, 'Datei')]);
  if (!d) throw fehler(404, 'Datei nicht gefunden');
  return d;
}

/** Freigabe fuer den Kunden an/aus */
async function setzeSichtbar(pool, id, sichtbar, { employeeId = null } = {}) {
  if (typeof sichtbar !== 'boolean') throw fehler(400, 'sichtbar muss true oder false sein');
  const d = await ladeDatei(pool, id);
  await pool.execute(
    'UPDATE metall_datei SET fuer_kunde_sichtbar = ?, sichtbar_geaendert_von = ?, sichtbar_geaendert_am = NOW() WHERE id = ? AND geloescht_am IS NULL',
    [sichtbar ? 1 : 0, employeeId, d.id]
  );
  // Kundenmail „Neue Fotos“ (#377), nur bei neuer Freigabe einer Datei aus dem Büro
  if (sichtbar && !d.fuer_kunde_sichtbar && d.quelle !== 'kunde') await require('./metallBenachrichtigung').vormerkeDateien(pool, d.vorgang_id);
  return { id: d.id, fuer_kunde_sichtbar: sichtbar };
}

/** Beschreibung setzen (leer = keine) */
async function setzeBeschreibung(pool, id, text) {
  const s = text == null ? '' : String(text).replace(/\s+/g, ' ').trim();
  if (s.length > BESCHREIBUNG_MAX) throw fehler(400, `Beschreibung ist zu lang (max. ${BESCHREIBUNG_MAX} Zeichen)`);
  const d = await ladeDatei(pool, id);
  await pool.execute('UPDATE metall_datei SET beschreibung = ? WHERE id = ?', [s || null, d.id]);
  return { id: d.id, beschreibung: s || null };
}

/**
 * Weich loeschen: Zeile bleibt (geloescht_am/-von), die Datei wandert nach <V>/_geloescht/,
 * die Vorschau wird entfernt. Fuer den Kunden sofort weg.
 */
async function loesche(pool, id, { employeeId = null } = {}) {
  const d = await ladeDatei(pool, id);
  const [res] = await pool.execute(
    'UPDATE metall_datei SET geloescht_am = NOW(), geloescht_von = ?, fuer_kunde_sichtbar = 0 WHERE id = ? AND geloescht_am IS NULL',
    [employeeId, d.id]
  );
  if (!res.affectedRows) throw fehler(409, 'Die Datei wurde inzwischen gelöscht');
  const ordner = path.dirname(d.pfad);
  const neu = `${ordner}/_geloescht/${path.basename(d.pfad)}`;
  try {
    await fs.mkdir(path.dirname(absolut(neu)), { recursive: true });
    await fs.rename(absolut(d.pfad), absolut(neu));
    await pool.execute('UPDATE metall_datei SET pfad = ?, vorschau_pfad = NULL WHERE id = ?', [neu, d.id]);
  } catch (err) {
    console.warn('[Metall-Dateien] Verschieben nach _geloescht fehlgeschlagen fuer', d.pfad + ':', err.message);
  }
  if (d.vorschau_pfad) await fs.rm(absolut(d.vorschau_pfad), { force: true }).catch(() => {});
  return { id: d.id, geloescht: true };
}

/** Datei bzw. Vorschau zum Ausliefern: { abs, mime, dateiname, inline } */
function auslieferung(d, { vorschau = false } = {}) {
  if (vorschau) {
    if (!d.vorschau_pfad) throw fehler(404, 'Keine Vorschau');
    return { abs: absolut(d.vorschau_pfad), mime: 'image/jpeg', dateiname: d.dateiname.replace(/\.[^.]+$/, '') + '.jpg', inline: true };
  }
  return { abs: absolut(d.pfad), mime: d.mime_typ, dateiname: d.dateiname, inline: INLINE.has(d.mime_typ) };
}

/** Fuers Buero: jede nicht geloeschte Datei */
async function oeffne(pool, id, opt) {
  return auslieferung(await ladeDatei(pool, id), opt);
}

/**
 * Fuer den Kundenbereich (interne API): nur freigegebene, nicht geloeschte Dateien eines
 * Vorgangs dieses Kunden (aktiver Merker). Alles andere ist 404.
 */
async function oeffneFuerKunde(pool, lexwareId, id, opt) {
  if (!lexwareId || typeof lexwareId !== 'string' || lexwareId.length > 64) throw fehler(404, 'Datei nicht gefunden');
  const [[d]] = await pool.execute(
    `SELECT d.* FROM metall_datei d
     JOIN metall_vorgang v ON v.id = d.vorgang_id
     JOIN metall_kunde k ON k.id = v.kunde_id
     WHERE d.id = ? AND k.lexware_kontakt_id = ? AND k.aktiv = 1
       AND d.fuer_kunde_sichtbar = 1 AND d.geloescht_am IS NULL`,
    [idOder404(id, 'Datei'), lexwareId]
  );
  if (!d) throw fehler(404, 'Datei nicht gefunden');
  return auslieferung(d, opt);
}

/** Antwort mit Datei senden (Express) – nosniff, kein Caching beim Kunden */
function sendeDatei(res, a, { privat = true } = {}) {
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Disposition', disposition(a.dateiname, a.inline));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', privat ? 'private, max-age=300' : 'no-store');
  return new Promise((resolve, reject) => {
    res.sendFile(a.abs, { dotfiles: 'allow' }, err => (err ? reject(Object.assign(err, { status: err.status || err.statusCode || 500 })) : resolve()));
  });
}

module.exports = {
  MAX_BYTES, MAX_DATEIEN, TYPEN,
  basisOrdner, absolut, typAus, sichererName, disposition,
  speichere, liste, setzeSichtbar, setzeBeschreibung, loesche, oeffne, oeffneFuerKunde, sendeDatei,
};
