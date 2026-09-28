#!/usr/bin/env node
/*
  소상공인 상가업소 CSV를 서울 구·동 단위 업종 요약으로 바꾼다.

  기본 입력: data/raw/store_businesses.csv
  기본 출력: web/data/store-summary.json
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_IN = path.join(ROOT, 'data', 'raw', 'store_businesses.csv');
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'store-summary.json');
const COMMERCIAL_VIEW = path.join(ROOT, 'web', 'data', 'commercial-view-dong.json');

const CATEGORIES = [
  {id: 'cafe', label: '개인 카페', include: ['커피', '카페', '다방'], exclude: ['프랜차이즈본사']},
  {id: 'food', label: '분식 · 김밥 · 샌드위치', include: ['분식', '김밥', '샌드위치', '토스트'], exclude: []},
  {id: 'fitness', label: '필라테스 · PT', include: ['필라테스', '헬스', '휘트니스', '피트니스', '체력단련'], exclude: []},
  {id: 'unmanned', label: '무인점포', include: ['무인', '셀프'], exclude: []},
  {id: 'academy', label: '학원 · 교습소', include: ['학원', '교습소', '교육'], exclude: []}
];

const FIELD_ALIASES = {
  sido: ['시도명', '시도', 'sido'],
  gu: ['시군구명', '시군구', '구', 'gusi'],
  dong: ['법정동명', '행정동명', '동', 'dong'],
  name: ['상호명', '상가업소명', 'name'],
  large: ['상권업종대분류명', '대분류명', 'large'],
  middle: ['상권업종중분류명', '중분류명', 'middle'],
  small: ['상권업종소분류명', '소분류명', 'small'],
  standard: ['표준산업분류명', 'standard'],
  address: ['도로명주소', '지번주소', 'rdnmAdr', 'lnoAdr', 'address'],
  lat: ['위도', 'lat'],
  lng: ['경도', 'lon', 'lng']
};

const POINT_LIMIT_PER_CATEGORY = 250;
const POINT_LIMIT_PER_SERVICE = 250;

function parseCsv(text){
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i], next = text[i + 1];
    if (quoted){
      if (ch === '"' && next === '"'){ cell += '"'; i++; }
      else if (ch === '"'){ quoted = false; }
      else cell += ch;
    } else if (ch === '"'){
      quoted = true;
    } else if (ch === ','){
      row.push(cell); cell = '';
    } else if (ch === '\n'){
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (ch !== '\r'){
      cell += ch;
    }
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

function pick(headers, names){
  for (const name of names){
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function classify(rowText){
  return CATEGORIES.filter(c => {
    const hit = c.include.some(w => rowText.includes(w));
    const blocked = c.exclude.some(w => rowText.includes(w));
    return hit && !blocked;
  }).map(c => c.id);
}

function compactText(value){
  return String(value || '').replace(/[\s·ㆍ/()\-]+/g, '');
}

function serviceTerms(label){
  const terms = new Set([label]);
  const stripped = label
    .replace(/음식점$/, '')
    .replace(/전문점$/, '')
    .replace(/판매점$/, '')
    .replace(/판매$/, '')
    .replace(/수리$/, '')
    .replace(/서비스$/, '');
  if (stripped && stripped !== label) terms.add(stripped);
  if (label === '커피-음료') terms.add('커피전문점');
  if (label === '패스트푸드점') terms.add('패스트푸드');
  if (label === '분식전문점') terms.add('분식');
  if (label === '호프-간이주점') terms.add('호프');
  if (label === '일반의류') terms.add('의류');
  if (label === '일반교습학원') terms.add('교습학원');
  if (label === '스포츠 강습') terms.add('스포츠강습');
  return [...terms].map(compactText).filter(Boolean);
}

function loadServiceCategories(){
  if (!fs.existsSync(COMMERCIAL_VIEW)) return [];
  try {
    const view = JSON.parse(fs.readFileSync(COMMERCIAL_VIEW, 'utf8'));
    return (view.business_types || [])
      .filter(item => item.kind === 'service' && item.id && item.label)
      .map(item => ({
        id: item.id,
        code: item.code,
        label: item.label,
        terms: serviceTerms(item.label)
      }));
  } catch (err) {
    return [];
  }
}

function classifyServices(rowText, serviceCategories){
  const text = compactText(rowText);
  if (!text) return [];
  return serviceCategories
    .filter(service => service.terms.some(term => term && text.includes(term)))
    .map(service => service.id);
}

function isSeoulName(name){
  const v = (name || '').trim();
  return v === '서울' || v === '서울특별시';
}

function summarizeRecords(records, asOf, options = {}){
  const serviceCategories = options.serviceCategories || loadServiceCategories();
  const byDong = new Map();
  const byGu = new Map();
  const totals = Object.fromEntries(CATEGORIES.map(c => [c.id, 0]));
  const serviceTotals = Object.fromEntries(serviceCategories.map(c => [c.id, 0]));
  const points = {};
  let sourceRows = 0;

  for (const r of records){
    if (!isSeoulName(r.sido)) continue;
    sourceRows++;
    const gu = (r.gu || '').trim();
    const dong = (r.dong || '').trim() || '(동 미상)';
    const textForClass = [r.name, r.large, r.middle, r.small, r.standard].filter(Boolean).join(' ');
    const cats = classify(textForClass);
    const services = classifyServices(textForClass, serviceCategories);
    if (!cats.length && !services.length) continue;

    const dongKey = gu + '/' + dong;
    if (!byDong.has(dongKey)) byDong.set(dongKey, {
      gu,
      dong,
      counts: Object.fromEntries(CATEGORIES.map(c => [c.id, 0])),
      service_counts: {},
      total: 0
    });
    if (!byGu.has(gu)) byGu.set(gu, {
      gu,
      counts: Object.fromEntries(CATEGORIES.map(c => [c.id, 0])),
      service_counts: {},
      total: 0
    });
    if (!points[dongKey]) points[dongKey] = Object.fromEntries(CATEGORIES.map(c => [c.id, []]));
    const d = byDong.get(dongKey), g = byGu.get(gu);
    for (const id of cats){
      d.counts[id]++; g.counts[id]++; totals[id]++;
      d.total++; g.total++;
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && points[dongKey][id].length < POINT_LIMIT_PER_CATEGORY){
        points[dongKey][id].push({
          n: (r.name || '').trim() || '(상호 미상)',
          c: (r.small || r.middle || r.standard || '').trim(),
          a: (r.address || '').trim(),
          lat,
          lng
        });
      }
    }
    for (const id of services){
      d.service_counts[id] = (d.service_counts[id] || 0) + 1;
      g.service_counts[id] = (g.service_counts[id] || 0) + 1;
      serviceTotals[id] = (serviceTotals[id] || 0) + 1;
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      if (!points[dongKey][id]) points[dongKey][id] = [];
      if (Number.isFinite(lat) && Number.isFinite(lng) && points[dongKey][id].length < POINT_LIMIT_PER_SERVICE){
        points[dongKey][id].push({
          n: (r.name || '').trim() || '(상호 미상)',
          c: (r.small || r.middle || r.standard || '').trim(),
          a: (r.address || '').trim(),
          lat,
          lng
        });
      }
    }
  }

  return {
    title: '서울 상가업소 업종 요약',
    as_of: asOf,
    source_rows: sourceRows,
    categories: CATEGORIES.map(({id, label}) => ({id, label})),
    service_categories: serviceCategories.map(({id, code, label}) => ({id, code, label})),
    totals,
    service_totals: serviceTotals,
    gu: [...byGu.values()].sort((a, b) => a.gu.localeCompare(b.gu, 'ko')),
    dong: [...byDong.values()].sort((a, b) => (a.gu + a.dong).localeCompare(b.gu + b.dong, 'ko')),
    points
  };
}

function summarizeRows(apiRows, asOf, options = {}){
  const records = apiRows.map(r => ({
    sido: r.ctprvnNm || r.시도명 || r.sido,
    gu: r.signguNm || r.시군구명 || r.gu,
    dong: r.adongNm || r.ldongNm || r.법정동명 || r.행정동명 || r.dong,
    name: r.bizesNm || r.상호명 || r.name,
    large: r.indsLclsNm || r.상권업종대분류명 || r.large,
    middle: r.indsMclsNm || r.상권업종중분류명 || r.middle,
    small: r.indsSclsNm || r.상권업종소분류명 || r.small,
    standard: r.ksicNm || r.표준산업분류명 || r.standard,
    address: r.rdnmAdr || r.lnoAdr || r.도로명주소 || r.지번주소 || r.address,
    lat: r.lat || r.위도,
    lng: r.lon || r.lng || r.경도
  }));
  return summarizeRecords(records, asOf, options);
}

function summarizeCsv(text, asOf, options = {}){
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV에 데이터가 없습니다.');

  const headers = rows[0].map(v => v.trim());
  const idx = Object.fromEntries(Object.entries(FIELD_ALIASES).map(([key, aliases]) => [key, pick(headers, aliases)]));
  for (const key of ['sido', 'gu', 'dong']){
    if (idx[key] < 0) throw new Error('필수 컬럼을 찾지 못했습니다: ' + key);
  }

  const records = rows.slice(1).map(cols => ({
    sido: cols[idx.sido] || '',
    gu: cols[idx.gu] || '',
    dong: cols[idx.dong] || '',
    name: idx.name >= 0 ? cols[idx.name] || '' : '',
    large: idx.large >= 0 ? cols[idx.large] || '' : '',
    middle: idx.middle >= 0 ? cols[idx.middle] || '' : '',
    small: idx.small >= 0 ? cols[idx.small] || '' : '',
    standard: idx.standard >= 0 ? cols[idx.standard] || '' : '',
    address: idx.address >= 0 ? cols[idx.address] || '' : '',
    lat: idx.lat >= 0 ? cols[idx.lat] || '' : '',
    lng: idx.lng >= 0 ? cols[idx.lng] || '' : ''
  }));
  return summarizeRecords(records, asOf, options);
}

function main(){
  const input = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_IN;
  const output = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUT;
  const asOf = process.argv[4] || new Date().toISOString().slice(0, 10);
  const text = fs.readFileSync(input, 'utf8');
  const summary = summarizeCsv(text, asOf);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, output)}  서울 ${summary.source_rows.toLocaleString('ko-KR')}행`);
}

if (require.main === module) main();

module.exports = {parseCsv, summarizeCsv, summarizeRows, summarizeRecords, classify, classifyServices, serviceTerms, CATEGORIES};
