#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {fetchSeoulOpenApi,safeRequestDiagnostic} = require('./fetch_seoul_openapi');
const {getKey, latestClosedQuarter, fetchPagedRows, HISTORY_SERVICES} = require('./commercial_api_common');

const REQUIRED_SERVICES = Object.freeze([
  ...['sales_dong', 'stores_dong', 'floating_population', 'worker_population_dong', 'resident_population_dong',
    'income_consumption_dong', 'change_index_dong', 'apartment_dong', 'facility_dong']
    .map(name => require('./fetch_commercial_' + name).SERVICE),
  ...Object.values(require('./fetch_commercial_regional_sales').configs).map(config => config.service),
  ...Object.values(require('./fetch_commercial_regional_stores').configs).map(config => config.service)
]);
const validQuarter = value => typeof value === 'string' && /^[1-9]\d{3}[1-4]$/.test(value);
const ordinal = quarter => Number(quarter.slice(0,4)) * 4 + Number(quarter[4]) - 1;
const fromOrdinal = index => String(Math.floor(index / 4)) + String(index % 4 + 1);

function quarterCandidates({quarter = '', baseline, now = new Date()}){
  if (quarter !== '') {
    if (!validQuarter(quarter)) throw new Error('Invalid explicit quarter');
    return [quarter];
  }
  if (!validQuarter(baseline) || !Number.isFinite(now.getTime())) throw new Error('Invalid approved baseline/date');
  const newest = ordinal(latestClosedQuarter(now)), oldest = ordinal(baseline);
  if (oldest > newest || newest - oldest >= 8) throw new Error('Approved baseline outside bounded quarter search');
  return Array.from({length: newest - oldest + 1}, (_, offset) => fromOrdinal(newest - offset));
}

async function resolveCommercialQuarter({key, quarter = '', baseline, now = new Date(), services = REQUIRED_SERVICES,
  fetchImpl = fetch, maxHistoryPages = 100, requestOptions = {}}){
  const candidates = quarterCandidates({quarter, baseline, now});
  if (!Array.isArray(services) || !services.length || services.length > 32 || new Set(services).size !== services.length ||
    services.some(service => typeof service !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(service))) throw new Error('Invalid required services');
  if (!Number.isInteger(maxHistoryPages) || maxHistoryPages < 1 || maxHistoryPages > 100) throw new Error('Invalid history probe bound');
  const history = new Map(), probes = [];
  for (const candidate of candidates) {
    let common = true;
    for (const service of services) {
      let published;
      try {
        if (HISTORY_SERVICES.includes(service)) {
          // This provider ignores the quarter parameter: inspect validated complete history once.
          if (!history.has(service)) history.set(service, fetchPagedRows({key, service, fetchImpl, maxPages: maxHistoryPages, requestOptions}));
          const data = await history.get(service);
          if (!data.rows.length) throw new Error('Empty history publication probe');
          published = data.rows.some(row => String(row.STDR_YYQU_CD) === candidate);
        } else {
          const data = await fetchSeoulOpenApi({...requestOptions, key, service, start:1, end:1, args:[candidate], fetchImpl});
          if (!data.payload.row.length) throw new Error('Empty publication probe');
          if (String(data.payload.row[0].STDR_YYQU_CD) !== candidate) throw new Error('Publication probe quarter mismatch');
          published = true;
        }
      } catch (error) {
        if (error.code !== 'INFO-200') {
          const diagnostic=safeRequestDiagnostic(error);
          const failure = new Error('Publication probe failed: service=' + service + ' quarter=' + candidate + ' ' +
            Object.entries(diagnostic).map(([name,value])=>name+'='+value).join(' '));
          Object.assign(failure,diagnostic);
          throw failure;
        }
        published = false;
      }
      probes.push({quarter:candidate, service, published});
      if (!published) { common = false; break; }
    }
    if (common) return {quarter:candidate, probes};
  }
  throw new Error(quarter ? 'Explicit quarter is not published by every required service' : 'No common published quarter at or above approved baseline');
}

async function main(){
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--(?:quarter|baseline)=.+$/.test(arg))) throw new Error('Invalid resolver arguments');
  const option = name => {
    const matches = args.filter(arg => arg.startsWith('--' + name + '='));
    if (matches.length > 1) throw new Error('Duplicate resolver argument');
    return matches.length ? matches[0].slice(name.length + 3) : '';
  };
  let baseline = option('baseline');
  if (!baseline) {
    try { baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../web/data/commercial-view-dong.json'), 'utf8')).quarter; }
    catch { throw new Error('Cannot read approved baseline snapshot'); }
  }
  const result = await resolveCommercialQuarter({key:getKey(), quarter:option('quarter'), baseline});
  console.log(result.quarter);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {REQUIRED_SERVICES, quarterCandidates, resolveCommercialQuarter};
