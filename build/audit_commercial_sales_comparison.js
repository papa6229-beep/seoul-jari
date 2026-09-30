#!/usr/bin/env node
const path = require('node:path');
const {assessReference} = require('../web/commercial-reference');

function totalStores(row){
  return row.similar_store_count ?? (row.store_count || 0) + (row.franchise_store_count || 0);
}

function audit({quarter, dongSales, dongStores, guSales, guStores}){
  const key = (gu, code) => gu + '|' + code;
  const dongTotals = new Map();
  for (const row of dongSales.filter(row => row.quarter === quarter)){
    const id = key(row.gu_code, row.business_code);
    const value = dongTotals.get(id) || {amount: 0, stores: 0};
    value.amount += row.amount || 0;
    dongTotals.set(id, value);
  }
  for (const row of dongStores.filter(row => row.quarter === quarter)){
    const id = key(row.gu_code, row.business_code);
    const value = dongTotals.get(id) || {amount: 0, stores: 0};
    value.stores += totalStores(row);
    dongTotals.set(id, value);
  }
  const districtStores = new Map(guStores.filter(row => row.quarter === quarter)
    .map(row => [key(row.area_code, row.business_code), row]));
  const groups = guSales.filter(row => row.quarter === quarter).flatMap(row => {
    const id = key(row.area_code, row.business_code);
    const dong = dongTotals.get(id);
    const storeRow = districtStores.get(id);
    if (!dong || !storeRow || !row.amount || !totalStores(storeRow)) return [];
    const guStoresCount = totalStores(storeRow);
    const match = assessReference({scope: '자치구', amount: row.amount, stores: guStoresCount}, dong);
    return [{
      gu: row.area_name,
      business: row.business_name,
      gu_amount: row.amount,
      dong_amount: dong.amount,
      gu_stores: guStoresCount,
      dong_stores: dong.stores,
      gu_monthly_per_store: Math.round(row.amount / guStoresCount / 3),
      sales_coverage: dong.amount / row.amount,
      comparable: match.comparable,
      sales_match: match.sales_match,
      stores_match: match.stores_match
    }];
  }).sort((a, b) => a.gu.localeCompare(b.gu, 'ko') || a.business.localeCompare(b.business, 'ko'));
  return {
    quarter,
    summary: {
      groups: groups.length,
      comparable: groups.filter(row => row.comparable).length,
      sales_mismatch: groups.filter(row => !row.sales_match).length,
      stores_mismatch: groups.filter(row => !row.stores_match).length
    },
    groups
  };
}

if (require.main === module){
  const root = path.resolve(__dirname, '..', 'web', 'data');
  const read = name => require(path.join(root, name + '.json'));
  const dongSales = read('commercial-sales-dong');
  const result = audit({
    quarter: dongSales.quarter,
    dongSales: dongSales.rows,
    dongStores: read('commercial-stores-dong').rows,
    guSales: read('commercial-sales-signgu').rows,
    guStores: read('commercial-stores-signgu').rows
  });
  console.log(JSON.stringify({quarter: result.quarter, ...result.summary}, null, 2));
}

module.exports = {audit};
