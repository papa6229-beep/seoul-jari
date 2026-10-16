const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const {fetchSeoulOpenApi} = require('./fetch_seoul_openapi');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_SERVICES = Object.freeze(['VwsmAdstrdFlpopW']);

function isCompactDate(value){
  if (typeof value !== 'string' || !/^[1-9]\d{7}$/.test(value)) return false;
  const date = new Date(value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8) + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10).replace(/-/g, '') === value;
}

function getArg(name, fallback = ''){
  const prefix = '--' + name + '=';
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function getKey(){
  const key = process.env.SEOUL_OPENAPI_KEY || '';
  if (!key) throw new Error('SEOUL_OPENAPI_KEY 환경변수가 필요합니다.');
  return key;
}

function normalizeNumber(value){
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function latestOnly(rows, key = 'quarter'){
  const latest = rows.reduce((max, row) => String(row[key] || '') > max ? String(row[key]) : max, '');
  return rows.filter(row => String(row[key]) === latest);
}

function latestClosedQuarter(date = new Date()){
  const kst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  let year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  let quarter = Math.ceil(month / 3) - 1;
  if (quarter === 0){
    year -= 1;
    quarter = 4;
  }
  return `${year}${quarter}`;
}

async function fetchPagedRows({
  key,
  service,
  quarter = '',
  date = '',
  pageSize = 1000,
  fetchImpl = fetch,
  rowIdentity,
  maxPages = Infinity,
  requestOptions = {}
}){
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('Invalid pageSize');
  if (quarter !== '' && !/^[1-9]\d{3}[1-4]$/.test(String(quarter))) throw new Error('Invalid requested quarter');
  if (rowIdentity !== undefined && typeof rowIdentity !== 'function') throw new Error('Invalid rowIdentity');
  if (date !== '' && !isCompactDate(date) || date && quarter) throw new Error('Invalid requested date');
  if (maxPages !== Infinity && (!Number.isSafeInteger(maxPages) || maxPages < 1)) throw new Error('Invalid maxPages');
  const history = HISTORY_SERVICES.includes(service);
  const rows = [];
  const pages = new Set(), identities = new Set();
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  let start = 1;
  let total = null;

  while (total === null || start <= total){
    const end = start + pageSize - 1;
    const data = await fetchSeoulOpenApi({
      ...requestOptions,
      key,
      service,
      start,
      end,
      args: quarter ? [quarter] : date ? [date] : [],
      fetchImpl
    });
    const payload = data.payload;
    const pageTotal = Number(payload.list_total_count);
    if (total !== null && pageTotal !== total) throw new Error('Page total changed: ' + service);
    total = pageTotal;
    if (Math.ceil(total / pageSize) > maxPages) throw new Error('API page limit exceeded');
    const rowSignatures = payload.row.map(row => JSON.stringify(stable(row)));
    const signature = crypto.createHash('sha256').update(JSON.stringify(rowSignatures.slice().sort())).digest('hex');
    if (pages.has(signature)) throw new Error('Repeated page: ' + service);
    pages.add(signature);
    for (const [index, row] of payload.row.entries()){
      if (history && !/^[1-9]\d{3}[1-4]$/.test(String(row.STDR_YYQU_CD))) throw new Error('Invalid history quarter');
      if (quarter !== '' && !history && String(row.STDR_YYQU_CD) !== String(quarter)) throw new Error('Requested quarter mismatch: ' + service);
      if (date !== '' && String(row.STDR_DE_ID) !== date) throw new Error('Requested date mismatch');
      // Default to the complete raw record, never an assumed area/business key.
      const identity = rowIdentity ? rowIdentity(row) : rowSignatures[index];
      if (!(typeof identity === 'string' && identity || typeof identity === 'number' && Number.isFinite(identity))) throw new Error('Invalid row identity: ' + service);
      if (identities.has(identity)) throw new Error('Duplicate row identity: ' + service);
      identities.add(identity);
    }
    rows.push(...payload.row);
    start = end + 1;
  }

  if (history && quarter) {
    const selected = rows.filter(row => String(row.STDR_YYQU_CD) === String(quarter));
    if (!selected.length) throw new Error('Requested history quarter has no rows');
    return {total, rows: selected};
  }
  return {total, rows};
}

function writeJson(out, payload, {fsImpl = fs} = {}){
  const serialized = JSON.stringify(payload, null, 2);
  if (typeof serialized !== 'string') throw new Error('Invalid JSON payload');
  const target = path.resolve(out);
  fsImpl.mkdirSync(path.dirname(target), {recursive: true});
  const temp = path.join(path.dirname(target), '.' + path.basename(target) + '.' + crypto.randomUUID() + '.tmp');
  let fd, owned = false;
  try {
    fd = fsImpl.openSync(temp, 'wx'); owned = true;
    fsImpl.writeFileSync(fd, serialized + '\n', 'utf8');
    fsImpl.fsyncSync(fd);
    fsImpl.closeSync(fd); fd = undefined;
    fsImpl.renameSync(temp, target); owned = false;
  } finally {
    if (fd !== undefined) { try { fsImpl.closeSync(fd); } catch {} }
    if (owned) fsImpl.unlinkSync(temp);
  }
}

module.exports = {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson, isCompactDate, HISTORY_SERVICES};
