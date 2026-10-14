#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const datasets = [
  ['living-population-daily-gu', 'gu', 'code', 'date'],
  ['commercial-floating-population-dong', 'dong', 'dong_code', 'quarter'],
  ...['sales', 'stores', 'worker-population', 'resident-population',
    'income-consumption', 'change-index', 'apartment', 'facility']
    .map(name => ['commercial-' + name + '-dong', 'rows', 'dong_code', 'quarter']),
  ...['sales', 'stores'].flatMap(name => ['signgu', 'mega', 'trdar', 'trdhl']
    .map(scope => ['commercial-' + name + '-' + scope, 'rows', 'area_code', 'quarter'])),
  ['commercial-view-dong', 'rows', 'code', 'quarter']
];

function counts(payload, [name, field, code, period], allowEmpty = false){
  if (!payload || !Array.isArray(payload[field])) throw new Error(`expected ${field} array`);
  if (allowEmpty && payload[field].length === 0) return {rows: 0, areas: 0};
  if (!payload[period]) throw new Error(`empty ${period}`);
  // Committed source files may contain history; compare only their advertised period.
  const rows = name === 'commercial-view-dong' ? payload[field]
    : payload[field].filter(row => row && row[period] === payload[period]);
  if (!rows.length) throw new Error(`empty ${field} for ${period}=${payload[period]}`);
  if (rows.some(row => !row || row[code] == null || String(row[code]).trim() === '')){
    throw new Error(`missing ${code} in current rows`);
  }
  return {rows: rows.length, areas: new Set(rows.map(row => String(row[code]))).size};
}

function validateRefresh({dataDir = path.join(ROOT, 'web', 'data'), readBaseline = file =>
  JSON.parse(execFileSync('git', ['show', 'HEAD:web/data/' + file],
    {cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024}))} = {}){
  const results = [];
  for (const dataset of datasets){
    const file = dataset[0] + '.json';
    try {
      const current = counts(JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')), dataset);
      const baseline = counts(readBaseline(file), dataset, true);
      // More than a 20% loss needs investigation before replacing committed data.
      for (const [key, label] of [['rows', 'row count'], ['areas', 'area coverage']]){
        if (current[key] < baseline[key] * 0.8){
          throw new Error(`${label} shrank from HEAD ${baseline[key]} to ${current[key]} `
            + `(minimum ${Math.ceil(baseline[key] * 0.8)}; 80% of HEAD)`);
        }
      }
      results.push({file, current, baseline});
    } catch (error){
      throw new Error(`Data refresh blocked: ${file}: ${error.message}. `
        + 'Do not commit these outputs; keep committed data and investigate the fetch result.');
    }
  }
  return results;
}

if (require.main === module){
  try {
    const results = validateRefresh();
    console.log(`Data refresh safety check passed for ${results.length} required datasets.`);
  } catch (error){
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {validateRefresh};
