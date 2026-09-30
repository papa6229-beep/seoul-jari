#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {audit} = require('./audit_commercial_sales_comparison');
const {fetchCommercialSalesDong} = require('./fetch_commercial_sales_dong');
const {fetchCommercialStoresDong} = require('./fetch_commercial_stores_dong');

const ROOT = path.resolve(__dirname, '..');
const QUARTERS = ['20253', '20254', '20261', '20262'];
const BUSINESS_CODE = 'CS100010';
const REPORT_PATH = path.join(ROOT, 'docs', 'commercial-sales-history-audit.md');
const progress = [];
const TARGETS = [
  {dong_code: '11710670', dong_name: '잠실2동', gu_code: '11710', gu_name: '송파구'},
  {dong_code: '11710510', dong_name: '풍납1동', gu_code: '11710', gu_name: '송파구'},
  {dong_code: '11260580', dong_name: '상봉1동', gu_code: '11260', gu_name: '중랑구'}
];

const totalStores = row => row.similar_store_count ?? (row.store_count || 0) + (row.franchise_store_count || 0);
const quarterName = value => value.slice(0, 4) + '년 ' + value.slice(4) + '분기';
const manwon = value => value === null ? '자료 없음' : Math.round(value / 10000).toLocaleString('ko-KR') + '만원';
const storeCount = value => value === null ? '자료 없음' : value.toLocaleString('ko-KR');

function summarizeQuarter(quarter, data, targets = TARGETS){
  const groups = audit({quarter, ...data}).groups;
  return targets.map(target => {
    const sales = data.dongSales.find(row => row.quarter === quarter && row.dong_code === target.dong_code && row.business_code === BUSINESS_CODE);
    const stores = data.dongStores.find(row => row.quarter === quarter && row.dong_code === target.dong_code && row.business_code === BUSINESS_CODE);
    const guSales = data.guSales.find(row => row.quarter === quarter && row.area_code === target.gu_code && row.business_code === BUSINESS_CODE);
    const guStores = data.guStores.find(row => row.quarter === quarter && row.area_code === target.gu_code && row.business_code === BUSINESS_CODE);
    const group = groups.find(row => row.gu === target.gu_name && row.business === '커피-음료');
    const dongCount = stores ? totalStores(stores) : 0;
    const guCount = guStores ? totalStores(guStores) : 0;
    const dongMonthly = sales && sales.amount && dongCount ? Math.round(sales.amount / dongCount / 3) : null;
    const guMonthly = guSales && guSales.amount && guCount ? Math.round(guSales.amount / guCount / 3) : null;
    const comparable = !!(group && group.comparable && dongMonthly && guMonthly);
    return {
      quarter,
      ...target,
      dong_stores: dongCount || null,
      dong_monthly: dongMonthly,
      gu_stores: guCount || null,
      gu_monthly: guMonthly,
      comparable,
      ratio: comparable ? dongMonthly / guMonthly : null
    };
  });
}

function renderReport(rows, targets = TARGETS){
  const lines = [
    '# 커피-음료 행정동 월평균 매출 4분기 점검',
    '',
    '서울시 상권분석서비스 추정매출과 점포 자료를 같은 분기·같은 업종으로 비교했다. 월평균 매출은 분기 매출 ÷ 전체 점포 수 ÷ 3이다. 개별 가게의 실제 매출이 아니다.',
    '',
    '동 매출·점포 수 합계가 구 원자료와 모두 일치한 분기에만 동/구 비율을 표시한다.',
    ''
  ];
  for (const target of targets){
    const series = rows.filter(row => row.dong_code === target.dong_code).sort((a, b) => a.quarter.localeCompare(b.quarter));
    const valid = series.filter(row => row.ratio !== null);
    let verdict = '자료 부족';
    if (valid.length === 4){
      if (valid.every(row => row.ratio >= 3)) verdict = '4분기 모두 구 평균의 3배 이상';
      else if (valid.every(row => row.ratio >= 1.5)) verdict = '4분기 모두 구 평균의 1.5배 이상';
      else if (valid.every(row => row.ratio <= .5)) verdict = '4분기 모두 구 평균의 절반 이하';
      else verdict = '분기별 차이가 있어 한 방향으로 단정하기 어려움';
    }
    lines.push(`## ${target.gu_name} ${target.dong_name}`, '', `판정: **${verdict}**`, '',
      '| 분기 | 동 가게 수 | 동 1곳 월평균 | 구 가게 수 | 구 1곳 월평균 | 동/구 비율 |',
      '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const row of series){
      lines.push(`| ${quarterName(row.quarter)} | ${storeCount(row.dong_stores)} | ${manwon(row.dong_monthly)} | ${storeCount(row.gu_stores)} | ${manwon(row.gu_monthly)} | ${row.ratio === null ? '비교 불가' : row.ratio.toFixed(2) + '배'} |`);
    }
    lines.push('');
  }
  lines.push('자료 출처: 서울 열린데이터광장 VwsmAdstrdSelngW, VwsmAdstrdStorW, VwsmSignguSelngW, VwsmSignguStorW.',
    '상봉1동 수치는 커피-음료 단일 업종이다. 커피·제과·패스트푸드를 합친 묶음 수치와 직접 비교하지 않는다.',
    '과거 분기 자료는 점검용으로만 사용했고 공개 사이트의 JSON은 수정하지 않았다.', '');
  return lines.join('\n');
}

function pacedFetch(fetchImpl = fetch, intervalMs = 900){
  let lastStarted = 0;
  return async url => {
    for (let attempt = 0; attempt < 3; attempt++){
      const wait = Math.max(0, intervalMs - (Date.now() - lastStarted));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastStarted = Date.now();
      try {
        const response = await fetchImpl(url);
        if (response.ok || (response.status < 500 && response.status !== 429)) return response;
        if (attempt === 2) return response;
      } catch (error){
        if (attempt === 2) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  };
}

async function fetchQuarter(key, quarter, fetchImpl, archivedDistrict){
  const requests = [
    ['dongSales', () => fetchCommercialSalesDong({key, quarter, fetchImpl})],
    ['dongStores', () => fetchCommercialStoresDong({key, quarter, fetchImpl})]
  ];
  const result = {...archivedDistrict};
  for (const [name, request] of requests){
    const payload = await request();
    if (payload.quarter !== quarter || !payload.rows.length || payload.rows.length !== payload.total_count){
      throw new Error(`${quarter} ${name}: 자료 분기 또는 행 수가 맞지 않습니다.`);
    }
    result[name] = payload.rows;
    progress.push(`${quarter} ${name}: ${payload.rows.length}행`);
    console.log(`${quarter} ${name}: ${payload.rows.length}행`);
  }
  return result;
}

async function main(){
  const key = process.env.SEOUL_OPENAPI_KEY;
  if (!key) throw new Error('SEOUL_OPENAPI_KEY가 없어 과거 분기를 조회할 수 없습니다.');
  const currentQuarter = QUARTERS.at(-1);
  const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'data', name + '.json'), 'utf8'));
  const current = {
    dongSales: read('commercial-sales-dong'),
    dongStores: read('commercial-stores-dong'),
    guSales: read('commercial-sales-signgu'),
    guStores: read('commercial-stores-signgu')
  };
  if (Object.values(current).some(payload => payload.quarter !== currentQuarter)){
    throw new Error('현재 공개 자료의 분기가 20262와 달라 점검을 중단합니다.');
  }
  const archivedDistrict = {guSales: current.guSales.rows, guStores: current.guStores.rows};
  for (const quarter of QUARTERS){
    if (!archivedDistrict.guSales.some(row => row.quarter === quarter) ||
        !archivedDistrict.guStores.some(row => row.quarter === quarter)){
      throw new Error(`${quarter}: 저장된 구 자료에 해당 분기가 없습니다.`);
    }
  }
  const summaries = [];
  const fetchImpl = pacedFetch();
  for (const quarter of QUARTERS){
    const data = quarter === currentQuarter
      ? Object.fromEntries(Object.entries(current).map(([name, payload]) => [name, payload.rows]))
      : await fetchQuarter(key, quarter, fetchImpl, archivedDistrict);
    summaries.push(...summarizeQuarter(quarter, data));
  }
  const report = renderReport(summaries);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(report);
}

if (require.main === module){
  main().catch(error => {
    const report = [
      '# 커피-음료 행정동 월평균 매출 4분기 점검 미완료',
      '',
      '과거 자료 수집이 끝나지 않아 분기별 변화나 지속성을 판단하지 않았다.',
      '',
      `오류: ${error.message}`,
      '',
      '완료된 조회:',
      ...progress.map(item => '- ' + item),
      ''
    ].join('\n');
    fs.writeFileSync(REPORT_PATH, report, 'utf8');
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {summarizeQuarter, renderReport, pacedFetch, fetchQuarter};
