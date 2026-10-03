// Real .xlsx files with no libraries: a small ZIP reader/writer plus SpreadsheetML.
// - fillCharacterSheet(): fills the classic "chr sht" template (data/sheet_template.xlsx)
//   and adds a "Full Stat Block" worksheet with everything that doesn't fit on the sheet.
// - buildWorkbook(): a fresh workbook from rows (used for roster exports).

import { sheet as makeSheet, statBlockText } from './render.js';
import { ABILITIES } from './rules.js';
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- ZIP ---------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Read a zip into {name: Uint8Array}. `inflateRaw(bytes)` may be sync or async. */
export async function unzip(bytes, inflateRaw) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + csize);
    files[name] = method === 0 ? raw.slice() : await inflateRaw(raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Write {name: Uint8Array|string} as a zip (stored, no compression). */
export function zip(files) {
  const entries = Object.entries(files).map(([name, data]) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    return { name: enc.encode(name), bytes, crc: crc32(bytes) };
  });
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = 0; const dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const e of entries) {
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
    h.setUint32(14, e.crc, true); h.setUint32(18, e.bytes.length, true); h.setUint32(22, e.bytes.length, true);
    h.setUint16(26, e.name.length, true); h.setUint16(28, 0, true);
    chunks.push(new Uint8Array(h.buffer), e.name, e.bytes);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
    c.setUint32(16, e.crc, true); c.setUint32(20, e.bytes.length, true); c.setUint32(24, e.bytes.length, true);
    c.setUint16(28, e.name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), e.name);
    offset += 30 + e.name.length + e.bytes.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of all) { out.set(x, o); o += x.length; }
  return out;
}

// ---- SpreadsheetML helpers ---------------------------------------------------------------------

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0 forbids most control characters
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function colToNum(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function numToCol(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function cellXml(ref, value, style) {
  const s = style != null ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

/** Clone a cell style with a different font size. Returns the new style index and updated styles XML. */
export function resizedStyle(stylesXml, xfIndex, size) {
  const fontsM = /<fonts count="(\d+)"[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
  const xfsM = /<cellXfs count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  if (!fontsM || !xfsM) return { stylesXml, index: xfIndex };
  const fonts = fontsM[2].match(/<font\/>|<font>[\s\S]*?<\/font>/g) || [];
  const xfs = xfsM[2].match(/<xf [^>]*?\/>|<xf [^>]*?>[\s\S]*?<\/xf>/g) || [];
  const xf = xfs[xfIndex];
  if (!xf) return { stylesXml, index: xfIndex };
  const fontId = Number(/fontId="(\d+)"/.exec(xf)?.[1] || 0);
  const font = (fonts[fontId] || '<font/>').replace(/<sz val="[\d.]+"\/>/, `<sz val="${size}"/>`);
  const newFontId = fonts.length;
  const newXf = xf
    .replace(/fontId="\d+"/, `fontId="${newFontId}"`)
    .replace(/\sapplyFont="\d"/, '')
    .replace(/^<xf /, '<xf applyFont="1" ');
  const openFonts = fontsM[0].slice(0, fontsM[0].indexOf('>') + 1).replace(/count="\d+"/, `count="${fonts.length + 1}"`);
  let out = stylesXml.replace(fontsM[0], `${openFonts}${fontsM[2]}${font}</fonts>`);
  const xfsM2 = /<cellXfs count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(out);
  const openXfs = xfsM2[0].slice(0, xfsM2[0].indexOf('>') + 1).replace(/count="\d+"/, `count="${xfs.length + 1}"`);
  out = out.replace(xfsM2[0], `${openXfs}${xfsM2[2]}${newXf}</cellXfs>`);
  return { stylesXml: out, index: xfs.length };
}

function cellStyle(xml, ref) {
  const m = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>)`).exec(xml);
  const s = m && /\ss="(\d+)"/.exec(m[1]);
  return s ? Number(s[1]) : null;
}

/** Set one cell in a worksheet XML string, keeping the cell's existing style (or forcing `forceStyle`). */
export function setCell(xml, ref, value, forceStyle) {
  const [, col, rowStr] = /^([A-Z]+)(\d+)$/.exec(ref);
  const rowNum = Number(rowStr);
  const rowRe = new RegExp(`<row r="${rowNum}"([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
  const m = rowRe.exec(xml);
  if (!m) {
    // insert a new row in order
    const rows = [...xml.matchAll(/<row r="(\d+)"/g)];
    const after = rows.find((r) => Number(r[1]) > rowNum);
    const rowXml = `<row r="${rowNum}">${cellXml(ref, value)}</row>`;
    if (after) return xml.slice(0, after.index) + rowXml + xml.slice(after.index);
    return xml.replace('</sheetData>', `${rowXml}</sheetData>`);
  }
  const attrs = m[1] || '';
  let inner = m[2] || '';
  const cellRe = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const cm = cellRe.exec(inner);
  if (cm) {
    const style = forceStyle ?? /\ss="(\d+)"/.exec(cm[1])?.[1];
    inner = inner.slice(0, cm.index) + cellXml(ref, value, style) + inner.slice(cm.index + cm[0].length);
  } else {
    const target = colToNum(col);
    const cells = [...inner.matchAll(/<c r="([A-Z]+)\d+"/g)];
    const after = cells.find((c) => colToNum(c[1]) > target);
    const x = cellXml(ref, value);
    inner = after ? inner.slice(0, after.index) + x + inner.slice(after.index) : inner + x;
  }
  return xml.slice(0, m.index) + `<row r="${rowNum}"${attrs}>${inner}</row>` + xml.slice(m.index + m[0].length);
}

/** Worksheet XML from rows of values. `widths` are column widths in characters. */
export function worksheetXml(rows, { widths = [], boldRows = [], wrapCols = [] } = {}) {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => {
      const style = boldRows.includes(r) ? 1 : wrapCols.includes(c) ? 2 : undefined;
      return v === '' || v == null ? '' : cellXml(`${numToCol(c + 1)}${r + 1}`, v, style);
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${cols ? '' : ''}<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** A brand-new workbook: sheets = [{name, rows, widths, boldRows, wrapCols}] */
export function buildWorkbook(sheets) {
  const files = {};
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(safeSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  files['xl/styles.xml'] = STYLES_XML;
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = worksheetXml(s.rows, s); });
  return zip(files);
}

function safeSheetName(name, i) {
  const n = String(name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
  return n || `Sheet${i + 1}`;
}

// ---- Character content -------------------------------------------------------------------------

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** Rows for the "Full Stat Block" sheet. */
export function statBlockRows(ch, R) {
  const s = makeSheet(ch, R);
  const id = ch.identity || {};
  const rows = [];
  rows.push([`${id.codename || 'Unnamed'}`, `PL ${ch.pl}`, `${ch.archetype?.name || ''} • ${ch.theme?.name || ''}${ch.alignment === 'villain' ? ' • Villain' : ''}`]);
  rows.push(['Real name', id.realName || '', '']);
  rows.push(['Seed', ch.seed || '', 'Recreate this character in DCUGen with the same seed and options.']);
  rows.push([]);
  rows.push(['ABILITIES', 'Rank', '']);
  for (const a of s.abilities) rows.push([a.name, a.total ?? '—', a.total !== a.base ? `base ${a.base}` : '']);
  rows.push([]);
  rows.push(['DEFENSES', 'Rank', '']);
  for (const d of s.defenses) rows.push([d.name, d.value, d.name === 'Toughness' && d.noRoll !== d.value ? `${d.noRoll} without Defensive Roll` : '']);
  rows.push(['Initiative', s.d.initiative, '']);
  rows.push(['Defense class: close (Parry + 10)', s.d.defenses.Parry + 10, 'DC for close attacks to hit (DCA 51)']);
  rows.push(['Defense class: ranged (Dodge + 10)', s.d.defenses.Dodge + 10, 'DC for ranged attacks to hit']);
  if (!s.d.defenses.immune?.Will) rows.push(['Defense class: mental (Will + 10)', s.d.defenses.Will + 10, 'DC for Will-targeting powers']);
  rows.push([]);
  rows.push(['POWERS', 'Points', 'Effect']);
  for (const p of s.powers) for (const l of p.lines) rows.push([`${l.alternate ? '   AE: ' : ''}${l.name}`, l.cost, l.text]);
  for (const dev of s.devices) {
    rows.push([`${dev.name} (${dev.kind === 'easily' ? 'Easily Removable' : 'Removable'})`, dev.total, `${dev.raw} points before the -${dev.discount} discount`]);
    for (const p of dev.powers) for (const l of p.lines) rows.push([`   ${l.alternate ? 'AE: ' : ''}${l.name}`, l.alternate ? l.cost : '', l.text]);
  }
  rows.push([]);
  rows.push(['OFFENSE', 'Bonus', 'Effect']);
  for (const o of s.offense) rows.push([o.label, o.attack?.roll ? sign(o.attack.bonus) : o.attack ? '—' : o.text, o.attack ? o.text : '']);
  rows.push([]);
  rows.push(['ADVANTAGES', 'Rank', 'Summary']);
  for (const a of s.advantages) rows.push([a.name + (a.param ? ` (${a.param})` : ''), a.rank || 1, R.advantage(a.name)?.summary || '']);
  rows.push([]);
  rows.push(['SKILLS', 'Ranks', 'Bonus']);
  for (const k of s.skills) rows.push([k.label, k.ranks, sign(k.bonus)]);
  rows.push([]);
  if (s.equipment.length) {
    rows.push(['EQUIPMENT', 'EP', 'Effect']);
    for (const e of s.equipment) rows.push([e.name, e.cost, e.effect || '']);
    rows.push([]);
  }
  const c = s.cost;
  rows.push(['POWER POINTS', 'Points', '']);
  rows.push(['Abilities', c.abilities, '']);
  rows.push(['Powers', c.powers, '']);
  rows.push(['Advantages', c.advantages, '']);
  rows.push(['Skills', c.skills, `${c.skillRanks} ranks`]);
  rows.push(['Defenses', c.defenses, '']);
  rows.push(['Total', c.total, `of ${c.budget} (PL ${ch.pl} x 15)`]);
  rows.push([]);
  rows.push(['COMPLICATIONS', '', '']);
  for (const x of ch.complications || []) rows.push([x.type, '', x.text]);
  rows.push([]);
  rows.push(['ORIGIN', '', ch.origin?.text || '']);
  rows.push(['GOAL', '', ch.goal || '']);
  if (ch.notes) rows.push(['NOTES', '', ch.notes]);
  rows.push([]);
  rows.push(['STAT BLOCK (text)', '', statBlockText(ch, R)]);
  const boldRows = rows.map((r, i) => (r.length && typeof r[0] === 'string' && r[0] === r[0].toUpperCase() && r[0].length > 3 ? i : -1)).filter((i) => i >= 0);
  return { rows, boldRows };
}

const SKILL_ROWS = {
  Acrobatics: [104], Athletics: [106], Deception: [118], Insight: [130], Intimidation: [132], Investigation: [134],
  Perception: [136], Persuasion: [138], 'Sleight of Hand': [148], Stealth: [150], Technology: [152], Treatment: [154], Vehicles: [156],
  'Close Combat': [110, 112, 114, 116], Expertise: [120, 122, 124, 126, 128], 'Ranged Combat': [140, 142, 144, 146],
};

/** Cell -> value map for the classic "chr sht" template. */
export function templateCells(ch, R) {
  const s = makeSheet(ch, R);
  const id = ch.identity || {};
  const cells = {};
  const put = (ref, v) => { if (v !== undefined && v !== null && v !== '') cells[ref] = v; };
  put('K2', id.codename); put('AP2', id.gender); put('BD2', id.age);
  put('K5', id.realName); put('AP5', ch.appearance?.eyes); put('BE5', ch.appearance?.height);
  put('AP8', ch.appearance?.hair); put('BE8', ch.appearance?.weight ? `${ch.appearance.weight} lb` : '');
  if (ch.complications?.some((x) => /Secret Identity/.test(x.type))) put('L8', 'SECRET ✓'); else put('U8', 'PUBLIC ✓');
  put('AN11', `${ch.archetype?.name || ''}${ch.alignment === 'villain' ? ' (villain)' : ''}`);
  const abilityCell = { Strength: 'N18', Stamina: 'N22', Agility: 'N26', Dexterity: 'N30', Fighting: 'N34', Intellect: 'N38', Awareness: 'N42', Presence: 'N46' };
  for (const a of ABILITIES) put(abilityCell[a], s.d.abilities[a] ?? '—');
  const def = s.d.defenses;
  put('Z18', def.Dodge); put('Z21', def.Fortitude); put('Z24', def.Parry); put('Z27', def.Will); put('Z30', def.Toughness);
  put('AD30', def.parts.stamina); put('AG30', def.parts.defensiveRoll); put('AJ30', def.parts.protection);
  put('AK18', s.d.initiative); put('AI21', 1);
  put('AD26', `${ch.theme?.name || ''}${ch.theme?.secondary ? ` + ${ch.theme.secondary.name}` : ''}`);
  put('W33', ch.pl); put('AD33', s.cost.total); put('AK33', Math.max(0, s.cost.budget - s.cost.total));
  put('M14', s.cost.abilities + s.cost.defenses); put('AB14', s.cost.powers); put('AQ14', s.cost.advantages); put('BF14', s.cost.skills);
  put('R38', (id.languages || ['English']).join(', '));

  // Offense: 16 rows from AN20 to AN50
  s.offense.slice(1).slice(0, 16).forEach((o, i) => {
    const r = 20 + i * 2;
    const a = o.attack;
    put(`AN${r}`, a.roll ? `${o.label} (${a.kind}, ${a.effect})` : `${o.label} (${a.kind}, ${a.effect}, DC ${a.effect === 'Damage' ? 15 + a.rank : 10 + a.rank})`);
    put(`BB${r}`, a.roll ? a.bonus : '—');
    put(`BF${r}`, a.rank);
  });

  // Powers: 11 slots from row 54 to 84
  const powerSlots = [];
  for (const p of s.powers) {
    const [first, ...alts] = p.lines;
    powerSlots.push({ text: `${first.name}: ${first.text}${alts.length ? ` | AE: ${alts.map((a) => `${a.name}: ${a.text}`).join(' | AE: ')}` : ''}`, cost: p.cost });
  }
  for (const dev of s.devices) {
    const inner = dev.powers.map((p) => p.lines.map((l) => `${l.alternate ? 'AE: ' : ''}${l.name}: ${l.text}`).join(' | ')).join(' | ');
    powerSlots.push({ text: `${dev.name} (${dev.kind === 'easily' ? 'Easily Removable' : 'Removable'}): ${inner}`, cost: dev.total });
  }
  if (powerSlots.length > 11) {
    const extra = powerSlots.splice(10);
    powerSlots.push({ text: extra.map((x) => `${x.text} [${x.cost}]`).join(' || '), cost: extra.reduce((t, x) => t + x.cost, 0) });
  }
  powerSlots.forEach((p, i) => { put(`B${54 + i * 3}`, p.text); put(`AE${54 + i * 3}`, p.cost); });

  put('AI55', [...s.equipment.map((e) => `${e.name} (${e.cost} ep): ${e.effect || ''}`), ...(s.equipment.length ? [] : ['—'])].join('\n'));

  // Complications and description
  const comps = (ch.complications || []).map((x) => `${x.type}: ${x.text}`);
  put('F88', comps[0]); put('F90', comps[1]); put('AK88', comps[2]); put('AK90', comps.slice(3).join(' '));
  put('G93', ch.origin?.text);
  const ap = ch.appearance || {};
  put('B95', `Costume: ${ap.costume || ''}. Skin: ${ap.skin || ''}. Distinctive feature: ${ap.feature || ''}. Base: ${id.base || ''}. Occupation: ${id.occupation || ''}.`);
  const per = ch.personality || {};
  put('B97', `Personality: ${[...(per.positive || []), ...(per.negative || [])].join(', ')}. Quirk: ${per.quirk || ''}. Goal: ${ch.goal || ''}.`);

  // Skills (ranked ones; specialized skills fill their multiple rows)
  const used = {};
  for (const k of s.skills) {
    const rows = SKILL_ROWS[k.name];
    let row;
    if (k.name === 'Close Combat' && k.spec === 'Unarmed') row = 108;
    else if (rows) { used[k.name] = used[k.name] || 0; row = rows[used[k.name]++]; }
    if (!row) row = 158;
    if (k.spec || row === 158) put(`I${row}`, row === 158 ? `${k.label}` : k.spec);
    put(`P${row}`, k.ranks);
    put(`S${row}`, k.bonus);
  }
  // Untrained totals for skills with no ranks
  for (const sk of R.raw.skills) {
    const rows = SKILL_ROWS[sk.name];
    if (!rows || sk.specialized || sk.trained_only) continue;
    if (s.skills.some((k) => k.name === sk.name)) continue;
    put(`S${rows[0]}`, s.d.abilities[sk.ability] ?? 0);
  }

  // Advantages: 20 rows from X104 to X142
  s.advantages.slice(0, 20).forEach((a, i) => {
    const r = 104 + i * 2;
    put(`X${r}`, a.name + (a.param ? ` (${a.param})` : ''));
    put(`AE${r}`, a.rank || 1);
    put(`AG${r}`, R.advantage(a.name)?.summary || '');
  });
  const notes = [`Made with DCUGen. Seed: ${ch.seed || 'custom'}. See the "Full Stat Block" sheet for every detail.`];
  if (s.advantages.length > 20) notes.push(`More advantages: ${s.advantages.slice(20).map((a) => a.label).join(', ')}.`);
  if (ch.notes) notes.push(ch.notes);
  notes.forEach((n, i) => put(`X${147 + i * 2}`, n));
  return cells;
}

/** Fill the template workbook and add the full stat block as a second sheet. Returns xlsx bytes. */
export async function fillCharacterSheet(templateBytes, ch, R, inflateRaw) {
  const files = await unzip(templateBytes, inflateRaw);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  let xml = dec.decode(files[sheetPath]);
  let styles = dec.decode(files['xl/styles.xml']);
  // The PL and point boxes use 18pt bold, which can't fit three digits; shrink only those.
  const resized = {};
  for (const ref of ['W33', 'AD33', 'AK33']) {
    const idx = cellStyle(xml, ref);
    if (idx == null) continue;
    if (!(idx in resized)) {
      const r = resizedStyle(styles, idx, 9);
      styles = r.stylesXml;
      resized[idx] = r.index;
    }
  }
  files['xl/styles.xml'] = enc.encode(styles);
  for (const [ref, v] of Object.entries(templateCells(ch, R))) {
    const idx = ['W33', 'AD33', 'AK33'].includes(ref) ? resized[cellStyle(xml, ref)] : undefined;
    xml = setCell(xml, ref, v, idx);
  }
  files[sheetPath] = enc.encode(xml);

  // Add "Full Stat Block" as sheet 2
  const { rows, boldRows } = statBlockRows(ch, R);
  const n = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).length + 1;
  files[`xl/worksheets/sheet${n}.xml`] = enc.encode(worksheetXml(rows, { widths: [34, 10, 110], boldRows, wrapCols: [2] }));
  let wb = dec.decode(files['xl/workbook.xml']);
  let rels = dec.decode(files['xl/_rels/workbook.xml.rels']);
  const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const rid = `rId${Math.max(0, ...ids) + 1}`;
  const sheetIds = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1]));
  wb = wb.replace('</sheets>', `<sheet name="Full Stat Block" sheetId="${Math.max(0, ...sheetIds) + 1}" r:id="${rid}"/></sheets>`);
  rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
  files['xl/workbook.xml'] = enc.encode(wb);
  files['xl/_rels/workbook.xml.rels'] = enc.encode(rels);
  let types = dec.decode(files['[Content_Types].xml']);
  types = types.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  files['[Content_Types].xml'] = enc.encode(types);
  // Rename the first sheet to the character's codename.
  const title = safeSheetName(ch.identity?.codename || 'Character', 0);
  files['xl/workbook.xml'] = enc.encode(dec.decode(files['xl/workbook.xml']).replace(/<sheet name="[^"]*" sheetId="1"/, `<sheet name="${esc(title)}" sheetId="1"`));
  delete files['xl/calcChain.xml'];
  return zip(files);
}

/** One row per character, for a whole roster or team. */
export function rosterWorkbook(characters, R) {
  const header = ['Codename', 'Real name', 'PL', 'Archetype', 'Theme', 'Alignment', 'STR', 'STA', 'AGL', 'DEX', 'FGT', 'INT', 'AWE', 'PRE',
    'Dodge', 'Parry', 'Fortitude', 'Toughness', 'Will', 'Initiative', 'Main attack', 'Points', 'Seed'];
  const rows = [header];
  for (const ch of characters) {
    const s = makeSheet(ch, R);
    const main = s.offense.find((o) => o.attack && o.attack.name !== 'Unarmed') || s.offense[1];
    rows.push([
      ch.identity?.codename || '', ch.identity?.realName || '', ch.pl, ch.archetype?.name || 'Custom', ch.theme?.name || '', ch.alignment || '',
      ...ABILITIES.map((a) => s.d.abilities[a] ?? '—'),
      s.d.defenses.Dodge, s.d.defenses.Parry, s.d.defenses.Fortitude, s.d.defenses.Toughness, s.d.defenses.Will, s.d.initiative,
      main ? `${main.label} ${main.text}` : '', s.cost.total, ch.seed || '',
    ]);
  }
  const sheets = [{ name: 'Roster', rows, widths: [22, 22, 5, 18, 22, 10, 5, 5, 5, 5, 5, 5, 5, 5, 7, 7, 9, 10, 6, 9, 50, 7, 22], boldRows: [0] }];
  for (const ch of characters) {
    const { rows: r, boldRows } = statBlockRows(ch, R);
    sheets.push({ name: ch.identity?.codename || 'Character', rows: r, widths: [34, 10, 110], boldRows, wrapCols: [2] });
  }
  // sheet names must be unique
  const seen = new Map();
  for (const s of sheets) {
    let n = safeSheetName(s.name, 0);
    const k = n.toLowerCase();
    if (seen.has(k)) { seen.set(k, seen.get(k) + 1); n = `${n.slice(0, 27)} (${seen.get(k)})`; } else seen.set(k, 1);
    s.name = n;
  }
  return buildWorkbook(sheets);
}
