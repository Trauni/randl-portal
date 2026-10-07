/**
 * #261 (07.10.2026): STMUPD-Datei mit PRODSTAMM/FPRODUKT für den Preis-Push nach SER.
 *
 * Vorlage: Testdatei aus #256 (STMUPD_0070_20261006_140551.XML), von SER angenommen –
 * nur der Preis wurde geändert, alle übrigen Felder und Produkte blieben unverändert.
 * Jeder FPRODUKT-Satz ist der vollständige gespeicherte SER-Datensatz (#260) mit neuem Preis;
 * fehlende Felder würden in SER auf Standardwerte fallen.
 *
 * Unterschiede zum Kunden-Push (ser-stmupd.js): Umlaute bleiben erhalten (sonst ändert sich
 * der Produktname in SER), Zeichen außerhalb von ISO-8859-1 brechen ab statt „?“.
 * Werte mit NULL im Export werden weggelassen (wie in der Testdatei); leere Texte gehen als "" mit
 * (in SER bleibt damit alles wie es ist – leere Felder hat SER in #256 angenommen).
 */

const iconv = require('iconv-lite');

// Attribute in XSD-Reihenfolge (stammdaten.xsd, FProduktType): [XML-Name, Feld im Export, Regel]
// Regeln: digits(min,max) = nur Ziffern, str(max) = Text, bool, enum, required
const digits = (min, max, required = false) => ({ kind: 'digits', min, max, required });
const str = (max, required = false) => ({ kind: 'str', max, required });
const bool = { kind: 'bool' };

const FPRODUKT_FIELDS = [
  ['prodnr', 'nr', str(10, true)],
  ['name', 'name', str(null, true)],
  ['preis', 'preis', digits(0, 8)],
  ['ek_preis', 'ek_preis', digits(0, 8)],
  ['pfand_nr', 'pfand_nr', digits(0, 8)],
  ['provision_nr', 'provision_nr', digits(0, 8)],
  ['steuer_nr', 'steuer_nr', digits(0, 8)],
  ['leerflaschen_nr', 'leerflaschen_nr', digits(0, 8)],
  ['ruecknahmekosten_nr', 'ruecknahmekosten_nr', digits(0, 8)],
  ['lfdnr', 'lfdnummer', digits(0, 5)],
  ['fuellgewicht', 'fuellgewicht', digits(1, 8, true)],
  ['behaeltergewicht', 'behaeltergewicht', digits(1, 8, true)],
  ['art', 'art', { kind: 'enum', values: ['B', 'T', 'S'], required: true }],
  ['bestandsrelevant', 'bestandsrelevant', bool],
  ['techngas', 'techngas', bool],
  ['unnr', 'unnr', digits(0, 4)],
  ['ggvs_faktor', 'ggvs_faktor', digits(0, 4)],
  ['gefahrzettel_nr', 'gefahrzettel_nr', str(10)],
  ['bezadr', 'bezadr', str(null)],
  ['bezchem', 'bezchem', str(null)],
  ['pflichteingabe', 'musseingabe', bool],
  ['kd_pflichteingabe', 'kundenabhaengige_musseingabe', bool],
  ['korr_dispo', 'anz_dispo', bool],
  ['anz_pro_palette', 'anzahl_pro_gitterbox', digits(0, 3)],
  ['stapelbar', 'stapelbar', bool],
  ['pfandpflicht', 'pfandpflicht', bool],
  ['negative_bestaende', 'negative_bestaende', bool],
  ['nachlassfaehig', 'nachlassfaehig', bool],
  ['chargenpflicht', 'chargenpflicht', bool],
  ['inhalt', 'inhalt', digits(1, 8)],
  ['palette', 'palette', bool],
  ['eingabe_voll', 'eingabe_voll', bool],
  ['eingabe_leer', 'eingabe_leer', bool],
  ['nullpreis', 'nullpreis_erlaubt', bool],
  ['akonto', 'akonto', bool],
  ['sonderprodukt', 'sonderprodukt', bool],
  ['gruppenbez', 'fgl_gruppenbez', str(40)],
  ['mmz_bis', 'mmz_bis', str(5)],
  ['gutschrift', 'gutschrift', bool],
  ['datev_konto', 'datev_konto', str(9)],
  ['datev_konto_mwstfrei', 'datev_konto_mwstfrei', str(9)],
  ['datev_konto_barverkauf', 'datev_konto_barverkauf', str(9)],
  ['datev_bu_schluessel', 'datev_bu_schluessel', str(2)],
  ['voll_leer_check', 'voll_leer_check', bool],
  ['handlingskosten', 'handlingskosten', bool],
  ['rueck_zuschlag', 'rueck_zuschlag', bool],
];

const LATIN1_RE = /^[\x00-\xFF]*$/;

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Exportwert → Attributwert (String) oder null (weglassen). Wirft bei Verstoß gegen die XSD. */
function toAttr(xmlName, value, rule) {
  if (value === null || value === undefined) {
    if (rule.required) throw new Error(`${xmlName} fehlt`);
    return null;
  }
  if (rule.kind === 'bool') {
    if (typeof value !== 'boolean') throw new Error(`${xmlName}: „${value}“ ist kein Wahrheitswert`);
    return String(value);
  }
  const s = String(value);
  if (rule.kind === 'digits') {
    if (!new RegExp(`^\\d{${rule.min},${rule.max}}$`).test(s)) {
      throw new Error(`${xmlName}: „${s}“ muss eine ganze Zahl mit ${rule.min}–${rule.max} Ziffern sein`);
    }
  } else if (rule.kind === 'enum') {
    if (!rule.values.includes(s)) throw new Error(`${xmlName}: „${s}“ nicht erlaubt (${rule.values.join('/')})`);
  } else {
    if (rule.required && s.length === 0) throw new Error(`${xmlName} ist leer`);
    if (rule.max != null && s.length > rule.max) throw new Error(`${xmlName}: „${s}“ länger als ${rule.max} Zeichen`);
  }
  if (!LATIN1_RE.test(s)) throw new Error(`${xmlName}: „${s}“ enthält Zeichen außerhalb ISO-8859-1`);
  return s;
}

/** Ein FPRODUKT-Element aus dem gespeicherten Datensatz mit neuem Preis (Cent). */
function buildFprodukt(record, newPreisCent) {
  if (record.typ !== 'F') throw new Error(`Produkt ${record.nr} ist kein Füllprodukt (Typ ${record.typ})`);
  const data = { ...record, preis: newPreisCent };
  const lines = [];
  for (const [xmlName, field, rule] of FPRODUKT_FIELDS) {
    const v = toAttr(xmlName, data[field], rule);
    if (v !== null) lines.push(`    ${xmlName}="${escapeAttr(v)}"`);
  }
  return `  <FPRODUKT\n${lines.join('\n')}\n  />`;
}

/**
 * @param {{ record: object, newPreisCent: number }[]} items
 * @param {{ versorgernr?: string, timestamp: string }} opts  timestamp = JJJJMMTT_hhmmss
 * @returns {{ xml: Buffer, xmlString: string, filename: string }}
 */
function buildProdstammXml(items, { versorgernr = '0070', timestamp }) {
  if (!items.length) throw new Error('Keine Produkte für die STMUPD-Datei');
  const errors = [];
  const elements = items.map(({ record, newPreisCent }) => {
    try { return buildFprodukt(record, newPreisCent); }
    catch (err) { errors.push(`${record.nr}: ${err.message}`); return null; }
  });
  if (errors.length) throw Object.assign(new Error('STMUPD-Datei ungültig – ' + errors.join('; ')), { status: 400, errors });

  const xmlString = `<?xml version="1.0" encoding="ISO-8859-1"?>
<STAMMDATEN versorgernr="${versorgernr}">
<PRODSTAMM>
${elements.join('\n')}
</PRODSTAMM>
</STAMMDATEN>
`;
  return {
    xml: iconv.encode(xmlString, 'ISO-8859-1'),
    xmlString,
    filename: `STMUPD_${versorgernr}_${timestamp}.XML`,
  };
}

module.exports = { buildProdstammXml, buildFprodukt, FPRODUKT_FIELDS };
