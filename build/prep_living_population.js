#!/usr/bin/env node
/*
  서울 생활인구 행정동 250m 월별 zip을 구·행정동 단위 요약 JSON으로 줄인다.

  입력 예:
    node build/prep_living_population.js C:/Downloads/250_LOCAL_RESD_ADMDONG_202608.zip

  출력:
    web/data/living-population.json
*/
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'living-population.json');
const DEFAULT_ADMIN_CODES = path.join(ROOT, 'web', 'data', 'admin-dong-codes.json');
const DECODER = new TextDecoder('euc-kr');

const SEOUL_GU = {
  '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구',
  '11230': '동대문구', '11260': '중랑구', '11290': '성북구', '11305': '강북구', '11320': '도봉구',
  '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구',
  '11500': '강서구', '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
  '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구'
};

const BUCKETS = {
  daytime: h => h >= 9 && h <= 18,
  night: h => h >= 19 || h <= 8,
  lunch: h => h >= 11 && h <= 14,
  evening: h => h >= 17 && h <= 21
};

function getArg(name, fallback = ''){
  const prefix = '--' + name + '=';
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function detectDelimiter(line){
  return line.includes('";"') ? ';' : ',';
}

function parseDelimitedLine(line, delimiter = detectDelimiter(line)){
  const out = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++){
    const ch = line[i], next = line[i + 1];
    if (quoted){
      if (ch === '"' && next === '"'){ cell += '"'; i++; }
      else if (ch === '"'){ quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter){ out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

function num(v){
  if (!v || v === '*') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function emptyAgg(){
  return {
    samples: 0,
    total: 0,
    buckets: Object.fromEntries(Object.keys(BUCKETS).map(k => [k, {samples: 0, total: 0}])),
    weekday: {samples: 0, total: 0},
    weekend: {samples: 0, total: 0}
  };
}

function add(agg, ymd, hour, value){
  agg.samples++;
  agg.total += value;
  for (const [k, pass] of Object.entries(BUCKETS)){
    if (pass(hour)){ agg.buckets[k].samples++; agg.buckets[k].total += value; }
  }
  const d = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00+09:00`);
  const target = d.getDay() === 0 || d.getDay() === 6 ? agg.weekend : agg.weekday;
  target.samples++;
  target.total += value;
}

function finalizeAgg(agg){
  const avg = x => x.samples ? Math.round(x.total / x.samples) : null;
  return {
    avg: avg(agg),
    daytime: avg(agg.buckets.daytime),
    night: avg(agg.buckets.night),
    lunch: avg(agg.buckets.lunch),
    evening: avg(agg.buckets.evening),
    weekday: avg(agg.weekday),
    weekend: avg(agg.weekend),
    samples: agg.samples
  };
}

function loadAdminDongCodes(filePath = DEFAULT_ADMIN_CODES){
  if (!fs.existsSync(filePath)) return new Map();
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return new Map((payload.dongs || []).map(row => [String(row.code), row]));
}

function zipList(zipPath){
  const r = spawnSync('tar', ['-tf', zipPath], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`zip 목록 읽기 실패: ${zipPath}\n${r.stderr}`);
  return r.stdout.split(/\r?\n/).filter(v => v.endsWith('.csv')).sort();
}

function zipRead(zipPath, member){
  const r = spawnSync('tar', ['-xOf', zipPath, member], {encoding: 'buffer', maxBuffer: 256 * 1024 * 1024});
  if (r.status !== 0) throw new Error(`zip 파일 읽기 실패: ${zipPath} ${member}\n${String(r.stderr || '')}`);
  return DECODER.decode(r.stdout);
}

function processCsvText(text, state){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return;
  const delimiter = detectDelimiter(lines[0]);
  state.headers = state.headers || parseDelimitedLine(lines[0], delimiter);
  for (const line of lines.slice(1)){
    const cols = parseDelimitedLine(line, delimiter);
    const ymd = cols[0];
    const hour = Number(cols[1]);
    const admCd = String(cols[2] || '').trim();
    const value = num(cols[3]);
    const guCode = admCd.slice(0, 5);
    const guName = SEOUL_GU[guCode];
    if (!guName || !ymd || !Number.isFinite(hour)) continue;

    if (!state.gu.has(guCode)) state.gu.set(guCode, {code: guCode, name: guName, agg: emptyAgg()});
    if (!state.dong.has(admCd)) state.dong.set(admCd, {code: admCd, gu_code: guCode, gu: guName, agg: emptyAgg()});
    add(state.gu.get(guCode).agg, ymd, hour, value);
    add(state.dong.get(admCd).agg, ymd, hour, value);
    state.rows++;
    state.minDate = state.minDate ? (ymd < state.minDate ? ymd : state.minDate) : ymd;
    state.maxDate = state.maxDate ? (ymd > state.maxDate ? ymd : state.maxDate) : ymd;
  }
}

function summarizeState(state, adminCodes = new Map()){
  return {
    title: '행정동별 서울 생활인구(250m) 요약',
    source: '[내국인] 행정동별 서울 생활인구(250m)',
    date_from: state.minDate,
    date_to: state.maxDate,
    source_rows: state.rows,
    files: state.files,
    metrics: {
      avg: '전체 시간 평균 생활인구',
      daytime: '09~18시 평균 생활인구',
      night: '19~08시 평균 생활인구',
      lunch: '11~14시 평균 생활인구',
      evening: '17~21시 평균 생활인구',
      weekday: '평일 평균 생활인구',
      weekend: '주말 평균 생활인구'
    },
    gu: [...state.gu.values()].map(x => ({code: x.code, name: x.name, ...finalizeAgg(x.agg)}))
      .sort((a, b) => a.code.localeCompare(b.code)),
    dong: [...state.dong.values()].map(x => {
      const meta = adminCodes.get(x.code);
      return {
        code: x.code,
        gu_code: x.gu_code,
        gu: meta ? meta.gu : x.gu,
        name: meta ? meta.name : null,
        full_name: meta ? meta.full_name : null,
        ...finalizeAgg(x.agg)
      };
    })
      .sort((a, b) => a.code.localeCompare(b.code))
  };
}

function summarizeZipFiles(zipPaths, adminCodes = new Map()){
  const state = {gu: new Map(), dong: new Map(), rows: 0, minDate: '', maxDate: '', headers: null, files: []};
  for (const zipPath of zipPaths){
    const members = zipList(zipPath);
    state.files.push({zip: path.basename(zipPath), csv_files: members.length});
    for (const member of members){
      processCsvText(zipRead(zipPath, member), state);
    }
  }
  return summarizeState(state, adminCodes);
}

function main(){
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const adminCodesPath = path.resolve(getArg('admin-codes', DEFAULT_ADMIN_CODES));
  const zipPaths = process.argv.slice(2).filter(a => !a.startsWith('--')).map(p => path.resolve(p));
  if (!zipPaths.length) throw new Error('생활인구 zip 파일 경로를 하나 이상 넣어주세요.');
  const summary = summarizeZipFiles(zipPaths, loadAdminDongCodes(adminCodesPath));
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, out)}  ${summary.date_from}~${summary.date_to}  ${summary.source_rows.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  try { main(); }
  catch (err){ console.error(err.message); process.exit(1); }
}

module.exports = {detectDelimiter, parseDelimitedLine, processCsvText, summarizeState, summarizeZipFiles, finalizeAgg, loadAdminDongCodes};
