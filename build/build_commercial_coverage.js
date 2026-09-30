#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'web', 'data');
const VIEW = path.join(DATA_DIR, 'commercial-view-dong.json');
const STORES = path.join(DATA_DIR, 'store-summary.json');
const OUT = path.join(DATA_DIR, 'commercial-coverage.json');

function readJson(file){
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function countMapDongs(points, id){
  let dongs = 0;
  let pointsCount = 0;
  for (const buckets of Object.values(points || {})){
    const list = buckets && buckets[id];
    if (Array.isArray(list) && list.length){
      dongs++;
      pointsCount += list.length;
    }
  }
  return {map_dongs: dongs, map_points: pointsCount};
}

function referenceSalesStatus(item){
  const scopes = item.reference_sales_scopes || [];
  if (item.has_sales || !scopes.length) return {};
  return {
    has_reference_sales: true,
    reference_sales_label: '참고 매출 있음',
    reference_sales_scopes: scopes
  };
}

function coverageStatus(item){
  if (item.has_sales && item.has_stores && item.sales_dongs < item.store_dongs){
    return {
      coverage_level: 'partial_sales',
      coverage_label: item.has_map_points ? '매출은 일부 동만 있음 · 가게 수·지도 있음' : '매출은 일부 동만 있음 · 지도핀 부족',
      recommended_action: '매출이 없는 동은 참고 평균을 이용한 추정값인지 확인하고 비교하세요.'
    };
  }
  if (item.has_sales && item.has_stores && item.has_map_points){
    return {
      coverage_level: 'complete',
      coverage_label: '매출·점포·지도 모두 있음',
      recommended_action: '상품 화면에서 매출, 경쟁, 지도 분석까지 바로 사용할 수 있습니다.'
    };
  }
  if (!item.has_sales && item.has_stores && item.has_map_points){
    return {
      coverage_level: 'needs_private_sales',
      coverage_label: '공공 매출 없음 · 점포·지도 있음',
      recommended_action: '공공 매출은 미제공입니다. 점포·수요·지도 중심으로 보여주고, 민간 카드 매출 보강 후보로 표시합니다.'
    };
  }
  if (item.has_sales && item.has_stores && !item.has_map_points){
    return {
      coverage_level: 'needs_map',
      coverage_label: '매출·점포 있음 · 지도핀 부족',
      recommended_action: '매출 분석은 가능하지만 실제 상호 위치가 부족합니다. 지도 데이터 보강 후보로 표시합니다.'
    };
  }
  if (!item.has_sales && item.has_stores && !item.has_map_points){
    return {
      coverage_level: 'needs_map',
      coverage_label: '점포 집계 있음 · 지도핀 부족',
      recommended_action: '공공 매출과 실제 위치 좌표가 부족합니다. 우선 점포 수와 수요만 참고하도록 표시합니다.'
    };
  }
  return {
    coverage_level: 'limited',
    coverage_label: '자료 부족',
    recommended_action: '상품 화면에서는 보조 업종으로만 노출하고, 추가 데이터 소스를 먼저 확인합니다.'
  };
}

function build(){
  const view = readJson(VIEW);
  const stores = fs.existsSync(STORES) ? readJson(STORES) : {};
  const rows = view.rows || [];
  const points = stores.points || {};
  const items = (view.business_types || []).map(type => {
    let salesDongs = 0;
    let storeDongs = 0;
    let salesTotal = 0;
    let storeTotal = 0;
    for (const row of rows){
      const bucket = row.biz && row.biz[type.id];
      if (!bucket) continue;
      if (bucket.sales && !bucket.sales_incomplete){
        salesDongs++;
        salesTotal += bucket.sales || 0;
      }
      if (bucket.stores){
        storeDongs++;
        storeTotal += bucket.stores || 0;
      }
    }
    const map = countMapDongs(points, type.id);
    const referenceScopes = [
      ...(rows.some(row => row.biz && row.biz[type.id] && row.biz[type.id].reference_sales) ? ['signgu'] : []),
      ...(type.reference_sales ? ['mega'] : [])
    ];
    const item = {
      id: type.id,
      code: type.code || null,
      label: type.label,
      kind: type.kind,
      has_sales: salesDongs > 0,
      has_stores: storeDongs > 0,
      has_map_points: map.map_points > 0,
      sales_dongs: salesDongs,
      store_dongs: storeDongs,
      sales_total: salesTotal,
      store_total: storeTotal,
      map_dongs: map.map_dongs,
      map_points: map.map_points
    };
    if (referenceScopes.length) item.reference_sales_scopes = referenceScopes;
    return {...item, ...referenceSalesStatus(item), ...coverageStatus(item)};
  });

  const payload = {
    title: '상권 업종별 데이터 커버리지',
    generated_at: new Date().toISOString(),
    quarter: view.quarter || null,
    rows: rows.length,
    summary: {
      business_types: items.length,
      service_types: items.filter(item => item.kind === 'service').length,
      service_with_sales: items.filter(item => item.kind === 'service' && item.has_sales).length,
      service_without_sales: items.filter(item => item.kind === 'service' && !item.has_sales).length,
      service_with_map_points: items.filter(item => item.kind === 'service' && item.has_map_points).length
    },
    items
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, OUT)} 업종=${items.length}`);
}

if (require.main === module) build();

module.exports = {build, countMapDongs, coverageStatus, referenceSalesStatus};
