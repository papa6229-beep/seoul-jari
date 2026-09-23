#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'web', 'data');
const OUT = path.join(DATA_DIR, 'commercial-view-dong.json');

const GROUP_BIZ = {
  cafe: ['커피', '음료', '제과', '패스트푸드'],
  food: ['한식', '분식', '김밥', '패스트푸드', '중식', '일식', '양식'],
  fitness: ['스포츠 강습', '스포츠클럽', '헬스', '체육'],
  academy: ['학원', '교습', '교육', '예술학원', '외국어'],
  unmanned: ['편의점', '슈퍼', '문구', '세탁', '생활용품']
};

const GROUP_LABELS = {
  cafe: '개인 카페',
  food: '분식 · 김밥 · 식사',
  fitness: '필라테스 · PT',
  academy: '학원 · 교습소',
  unmanned: '무인점포'
};

function readJson(name){
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function rows(payload){
  if (!payload) return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.dong)) return payload.dong;
  return [];
}

function indexBy(list, key){
  return Object.fromEntries(rows(list).map(row => [row[key], row]));
}

function matchesBiz(row, biz){
  const name = String(row.business_name || '');
  return GROUP_BIZ[biz].some(word => name.includes(word));
}

function createBucket(){
  return {
    sales: 0,
    sales_count: 0,
    stores: 0,
    franchises: 0,
    open: 0,
    close: 0,
    sales_items: [],
    store_items: []
  };
}

function getBucket(row, key){
  if (!row.biz[key]) row.biz[key] = createBucket();
  return row.biz[key];
}

function addTop(list, item, key, limit = 5){
  list.push(item);
  list.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  if (list.length > limit) list.length = limit;
}

function compact(){
  const codes = readJson('admin-dong-codes.json');
  const floating = readJson('commercial-floating-population-dong.json');
  const sales = readJson('commercial-sales-dong.json');
  const stores = readJson('commercial-stores-dong.json');
  const workers = readJson('commercial-worker-population-dong.json');
  const residents = readJson('commercial-resident-population-dong.json');
  const income = readJson('commercial-income-consumption-dong.json');

  const businessTypesById = new Map(Object.keys(GROUP_BIZ).map(key => [key, {
    id: key,
    label: GROUP_LABELS[key],
    kind: 'group',
    group: '추천 업종',
    words: GROUP_BIZ[key]
  }]));

  for (const item of [...rows(sales), ...rows(stores)]){
    if (!item.business_code || !item.business_name) continue;
    const id = `svc_${item.business_code}`;
    if (!businessTypesById.has(id)){
      businessTypesById.set(id, {
        id,
        label: item.business_name,
        kind: 'service',
        group: '전체 업종',
        code: item.business_code
      });
    }
  }

  const serviceTypes = Array.from(businessTypesById.values())
    .filter(item => item.kind === 'service')
    .sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'));

  const byCode = new Map(codes.dongs.map(code => [code.code, {
    code: code.code,
    gu: code.gu,
    name: code.name,
    full_name: code.full_name,
    biz: {}
  }]));

  const floatingBy = indexBy(floating, 'dong_code');
  const workerBy = indexBy(workers, 'dong_code');
  const residentBy = indexBy(residents, 'dong_code');
  const incomeBy = indexBy(income, 'dong_code');

  for (const row of byCode.values()){
    const f = floatingBy[row.code] || {};
    const w = workerBy[row.code] || {};
    const r = residentBy[row.code] || {};
    const inc = incomeBy[row.code] || {};
    row.floating = f.total || null;
    row.lunch_flow = f.t_11_14 || null;
    row.evening_flow = f.t_17_21 || null;
    row.workers = w.total || null;
    row.residents = r.total || null;
    row.households = r.households || null;
    row.core_people = ((r.age_20 || 0) + (r.age_30 || 0) + (r.age_40 || 0) + (w.age_20 || 0) + (w.age_30 || 0) + (w.age_40 || 0)) || null;
    row.spending = inc.total_spending || null;
    row.food_spending = inc.food_spending || null;
    row.education_spending = inc.education_spending || null;
    row.leisure_spending = inc.leisure_culture_spending || null;
  }

  for (const item of rows(sales)){
    const row = byCode.get(item.dong_code);
    if (!row) continue;
    for (const biz of Object.keys(GROUP_BIZ)){
      if (!matchesBiz(item, biz)) continue;
      const bucket = getBucket(row, biz);
      bucket.sales += item.amount || 0;
      bucket.sales_count += item.count || 0;
      addTop(bucket.sales_items, {
        business_name: item.business_name,
        amount: item.amount || 0
      }, 'amount');
    }
    if (item.business_code){
      const bucket = getBucket(row, `svc_${item.business_code}`);
      bucket.sales += item.amount || 0;
      bucket.sales_count += item.count || 0;
      addTop(bucket.sales_items, {
        business_name: item.business_name,
        amount: item.amount || 0
      }, 'amount');
    }
  }

  for (const item of rows(stores)){
    const row = byCode.get(item.dong_code);
    if (!row) continue;
    for (const biz of Object.keys(GROUP_BIZ)){
      if (!matchesBiz(item, biz)) continue;
      const bucket = getBucket(row, biz);
      bucket.stores += item.store_count || 0;
      bucket.franchises += item.franchise_store_count || 0;
      bucket.open += item.open_store_count || 0;
      bucket.close += item.close_store_count || 0;
      addTop(bucket.store_items, {
        business_name: item.business_name,
        store_count: item.store_count || 0
      }, 'store_count');
    }
    if (item.business_code){
      const bucket = getBucket(row, `svc_${item.business_code}`);
      bucket.stores += item.store_count || 0;
      bucket.franchises += item.franchise_store_count || 0;
      bucket.open += item.open_store_count || 0;
      bucket.close += item.close_store_count || 0;
      addTop(bucket.store_items, {
        business_name: item.business_name,
        store_count: item.store_count || 0
      }, 'store_count');
    }
  }

  const payload = {
    title: '서울 상권 화면용 행정동 통합 데이터',
    source: '서울신용보증재단 상권분석서비스 OpenAPI',
    quarter: sales.quarter || stores.quarter || floating.quarter || null,
    generated_at: new Date().toISOString(),
    business_types: [
      ...Array.from(businessTypesById.values()).filter(item => item.kind === 'group'),
      ...serviceTypes
    ],
    rows: Array.from(byCode.values())
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, OUT)} 행정동=${payload.rows.length} 기준분기=${payload.quarter || '-'}`);
}

if (require.main === module) compact();

module.exports = {BIZ: GROUP_BIZ, compact};
