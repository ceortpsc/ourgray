const MIME_TYPES = Object.freeze({
  json: 'application/json',
  csv: 'text/csv;charset=utf-8',
  ndjson: 'application/x-ndjson',
  xhtml: 'application/xhtml+xml;charset=utf-8'
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableStringify(value, spacing = 0) {
  return JSON.stringify(stableValue(value), null, spacing);
}

export async function sha256Hex(content) {
  const bytes = new TextEncoder().encode(String(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizedRows(input) {
  if (Array.isArray(input)) return input;
  if (input === null || input === undefined) return [];
  return [input];
}

function columnsFor(rows) {
  const set = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(key => set.add(key));
    else set.add('value');
  }
  return [...set].sort();
}

function toCsv(rows) {
  const columns = columnsFor(rows);
  const body = rows.map(row => {
    const object = row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row };
    return columns.map(column => csvCell(object[column])).join(',');
  });
  return [columns.map(csvCell).join(','), ...body].join('\r\n');
}

function toNdjson(rows) {
  return rows.map(row => stableStringify(row)).join('\n') + (rows.length ? '\n' : '');
}

function toXhtml({ title, rows, metadata }) {
  const columns = columnsFor(rows);
  const metaRows = Object.entries(metadata || {}).map(([key, value]) => `<tr><th>${escapeXml(key)}</th><td>${escapeXml(typeof value === 'object' ? JSON.stringify(value) : value)}</td></tr>`).join('');
  const headers = columns.map(column => `<th scope="col">${escapeXml(column)}</th>`).join('');
  const body = rows.map(row => {
    const object = row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row };
    return `<tr>${columns.map(column => `<td>${escapeXml(typeof object[column] === 'object' ? JSON.stringify(object[column]) : object[column])}</td>`).join('')}</tr>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
  <title>${escapeXml(title)}</title>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />
  <style type="text/css">
    body{font-family:Arial,sans-serif;color:#18212d;margin:32px}h1{color:#0b1f3a;border-bottom:3px solid #d9a441;padding-bottom:10px}table{border-collapse:collapse;width:100%;margin:18px 0}th{background:#0b1f3a;color:#fff;text-align:left}th,td{border:1px solid #bfc7d1;padding:8px;vertical-align:top}tr:nth-child(even) td{background:#f5f7fa}.meta{max-width:900px}.footer{margin-top:24px;padding-top:12px;border-top:2px solid #d9a441;color:#5e6875;font-size:12px}
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <table class="meta"><tbody>${metaRows}</tbody></table>
  <table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>
  <div class="footer">The Great Gray Horizon Counseling Center · Powered by Ross Tax Pro Software Co.</div>
</body>
</html>`;
}

function slug(value) {
  return String(value || 'export').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

export async function exportDataset({
  name,
  rows,
  format = 'json',
  metadata = {},
  locale = 'en-US',
  timezone = 'UTC',
  generatedAt = new Date().toISOString(),
  includeManifest = true
} = {}) {
  const normalizedFormat = String(format).toLowerCase();
  assert(MIME_TYPES[normalizedFormat], `Unsupported export format: ${format}`);
  assert(name, 'Export name is required.');
  const normalized = normalizedRows(rows);
  const exportMetadata = {
    exportName: name,
    generatedAt,
    recordCount: normalized.length,
    locale,
    timezone,
    ...metadata
  };

  let content;
  if (normalizedFormat === 'json') content = stableStringify({ metadata: exportMetadata, records: normalized }, 2);
  if (normalizedFormat === 'csv') content = toCsv(normalized);
  if (normalizedFormat === 'ndjson') content = toNdjson(normalized);
  if (normalizedFormat === 'xhtml') content = toXhtml({ title: name, rows: normalized, metadata: exportMetadata });

  const checksum = await sha256Hex(content);
  const filename = `${slug(name)}-${generatedAt.slice(0, 10)}.${normalizedFormat}`;
  const manifest = {
    schemaVersion: 1,
    filename,
    format: normalizedFormat,
    mimeType: MIME_TYPES[normalizedFormat],
    generatedAt,
    recordCount: normalized.length,
    byteLength: new TextEncoder().encode(content).byteLength,
    checksumAlgorithm: 'SHA-256',
    checksum,
    metadata: exportMetadata
  };

  return {
    filename,
    mimeType: MIME_TYPES[normalizedFormat],
    content,
    checksum,
    manifest: includeManifest ? manifest : null,
    manifestFilename: includeManifest ? `${filename}.manifest.json` : null,
    manifestContent: includeManifest ? stableStringify(manifest, 2) : null
  };
}

export function triggerBrowserDownload({ filename, content, mimeType }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
