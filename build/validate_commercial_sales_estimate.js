#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dongSalesEstimate = require('../web/dong-sales-estimate.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'data', 'commercial-view-dong.json'), 'utf8'));
const errors = {district_complete: [], district_known: [], seoul_known: []};
const baselines = {district_complete: [], district_known: [], seoul_known: []};

function range(values){
  const finite = values.filter(Number.isFinite);
  return [Math.min(...finite), Math.max(...finite)];
}

function norm(value, [min, max], inverse = false){
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return .5;
  const scaled = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return inverse ? 1 - scaled : scaled;
}

function record(key, reference, factor, actual){
  if (!Number.isFinite(reference) || reference <= 0) return;
  errors[key].push(reference * factor / actual);
  baselines[key].push(reference / actual);
}

for (const type of data.business_types.filter(item => item.id.startsWith('svc_'))){
  const rows = data.rows.map(source => {
    const item = source.biz[type.id] || {};
    const sales = item.sales_incomplete ? 0 : (item.sales || 0);
    return {
      gu: source.gu,
      sales,
      stores: item.stores || 0,
      demand: (source.floating || 0) + (source.workers || 0) * 800 + (source.residents || 0) * 250,
      spending: source.spending || 0,
      core: source.core_people || 0,
      rawSpending: source.spending,
      rawCore: source.core_people
    };
  });
  const ranges = {
    demand: range(rows.map(row => row.demand)),
    spending: range(rows.map(row => row.rawSpending)),
    core: range(rows.map(row => row.rawCore)),
    stores: range(rows.map(row => row.stores))
  };
  const byDistrict = new Map();
  const seoul = {sales: 0, stores: 0};
  for (const row of rows){
    if (!byDistrict.has(row.gu)) byDistrict.set(row.gu, {sales: 0, stores: 0, hasMissingSales: false});
    const district = byDistrict.get(row.gu);
    if (row.stores && !row.sales) district.hasMissingSales = true;
    if (!row.sales || !row.stores) continue;
    district.sales += row.sales;
    district.stores += row.stores;
    seoul.sales += row.sales;
    seoul.stores += row.stores;
  }
  for (const row of rows){
    if (!row.sales || !row.stores) continue;
    const actual = Math.round(row.sales / row.stores / 3);
    const weighted =
      norm(row.demand, ranges.demand) * .42 +
      norm(row.spending, ranges.spending) * .24 +
      norm(row.core, ranges.core) * .18 +
      norm(row.stores, ranges.stores, true) * .16;
    const factor = Math.max(.75, Math.min(1.35, .72 + weighted * .72));
    const district = byDistrict.get(row.gu);
    if (district.stores > row.stores && district.sales > row.sales){
      const reference = (district.sales - row.sales) / (district.stores - row.stores) / 3;
      record('district_known', reference, factor, actual);
      if (!district.hasMissingSales) record('district_complete', reference, factor, actual);
    }
    if (seoul.stores) record('seoul_known', seoul.sales / seoul.stores / 3, factor, actual);
  }
}

function summarize(ratios){
  const deviations = ratios.map(ratio => Math.abs(ratio - 1)).sort((a, b) => a - b);
  return {
    pairs: ratios.length,
    median_absolute_percentage_error: +(deviations[Math.floor(deviations.length / 2)] * 100).toFixed(1),
    within_half_to_double_percent: +(ratios.filter(ratio => ratio >= .5 && ratio <= 2).length / ratios.length * 100).toFixed(1)
  };
}

for (const key of Object.keys(errors)){
  console.log(JSON.stringify({reference: key, model: summarize(errors[key]), reference_only: summarize(baselines[key])}));
}

const peerModel = dongSalesEstimate.create(data);
const peerRatios = [];
const peerBaselines = [];
for (const type of data.business_types.filter(item => item.id.startsWith('svc_'))){
  let citySales = 0;
  let cityStores = 0;
  for (const row of data.rows){
    const item = row.biz[type.id];
    if (!item || !item.sales || item.sales_incomplete || !item.stores) continue;
    citySales += item.sales;
    cityStores += item.stores;
  }
  if (!cityStores) continue;
  const reference = citySales / cityStores / 3;
  for (const row of data.rows){
    const item = row.biz[type.id];
    if (!item || !item.sales || item.sales_incomplete || !item.stores) continue;
    const predicted = peerModel.forDong(type.id, row.code, reference);
    if (!predicted) continue;
    const actual = Math.round(item.sales / item.stores / 3);
    peerRatios.push(predicted.monthly_won / actual);
    peerBaselines.push(reference / actual);
  }
}
console.log(JSON.stringify({reference: 'seoul_known_peer_model', model: summarize(peerRatios), reference_only: summarize(peerBaselines)}));
