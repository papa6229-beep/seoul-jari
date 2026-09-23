const fs = require('fs');
const path = require('path');
const {fetchSeoulOpenApi} = require('./fetch_seoul_openapi');

const ROOT = path.resolve(__dirname, '..');

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

async function fetchPagedRows({
  key,
  service,
  quarter = '',
  pageSize = 1000,
  fetchImpl = fetch
}){
  const rows = [];
  let start = 1;
  let total = null;

  while (total === null || start <= total){
    const end = start + pageSize - 1;
    const data = await fetchSeoulOpenApi({
      key,
      service,
      start,
      end,
      args: quarter ? [quarter] : [],
      fetchImpl
    });
    const payload = data.payload || {};
    total = Number(payload.list_total_count || 0);
    rows.push(...(payload.row || []));
    if (!payload.row || payload.row.length === 0) break;
    start = end + 1;
  }

  return {total, rows};
}

function writeJson(out, payload){
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

module.exports = {ROOT, getArg, getKey, normalizeNumber, latestOnly, fetchPagedRows, writeJson};
