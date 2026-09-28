const assert = require('assert');
const {summarizeApartment, summarizeFacilities, summarizeMarketChange, summarizeReferenceSales, summarizeTopMarkets} = require('./build_commercial_view_data');

const apartment = summarizeApartment({
  apartment_complexes: 42,
  average_area: 84,
  average_market_price: 712345678,
  small_households: 100,
  large_households: 70,
  extra_large_households: 30,
  high_price_households: 18
});
assert.deepStrictEqual(apartment, {
  complexes: 42,
  average_area: 84,
  average_market_price: 712345678,
  small_households: 100,
  large_households: 100,
  high_price_households: 18
});

const facilities = summarizeFacilities({
  total_facilities: 93,
  public_offices: 6,
  banks: 3,
  general_hospitals: null,
  hospitals: 2,
  pharmacies: 4,
  kindergartens: 1,
  elementary_schools: 1,
  middle_schools: 2,
  high_schools: 2,
  universities: 8,
  subway_stations: null,
  bus_stops: 26
});
assert.deepStrictEqual(facilities, {
  total: 93,
  public_offices: 6,
  banks: 3,
  hospitals: 2,
  pharmacies: 4,
  schools: 14,
  universities: 8,
  subway_stations: null,
  bus_stops: 26
});

const marketChange = summarizeMarketChange({
  change_code: 'LH',
  change_name: '상권확장',
  operation_months_avg: 98,
  close_months_avg: 55,
  seoul_operation_months_avg: 105,
  seoul_close_months_avg: 52
});
assert.deepStrictEqual(marketChange, {
  code: 'LH',
  name: '상권확장',
  operation_months: 98,
  close_months: 55,
  seoul_operation_months: 105,
  seoul_close_months: 52
});

const referenceSales = summarizeReferenceSales(
  [{business_code: 'CS100001', business_name: '한식음식점', amount: 900000000, count: 30000}],
  [{business_code: 'CS100001', store_count: 30}],
  {code: 'CS100001', label: '한식음식점'}
);
assert.deepStrictEqual(referenceSales, {
  scope: '서울시',
  amount: 900000000,
  count: 30000,
  stores: 30,
  monthly_sales_per_store: 10000000,
  customer_unit_price: 30000
});

const guReferenceSales = summarizeReferenceSales(
  [
    {area_code: '11740', business_code: 'CS100001', business_name: '한식음식점', amount: 300000000, count: 15000},
    {area_code: '11680', business_code: 'CS100001', business_name: '한식음식점', amount: 600000000, count: 30000}
  ],
  [
    {area_code: '11740', business_code: 'CS100001', store_count: 10},
    {area_code: '11680', business_code: 'CS100001', store_count: 20}
  ],
  {code: 'CS100001', label: '한식음식점'},
  '자치구',
  '11740'
);
assert.deepStrictEqual(guReferenceSales, {
  scope: '자치구',
  amount: 300000000,
  count: 15000,
  stores: 10,
  monthly_sales_per_store: 10000000,
  customer_unit_price: 20000
});

assert.deepStrictEqual(summarizeTopMarkets(
  [
    {area_code: '3001', area_name: 'A상권', market_type_name: '골목상권', business_code: 'CS100001', business_name: '한식음식점', amount: 900000000, count: 30000},
    {area_code: '3002', area_name: 'B상권', market_type_name: '발달상권', business_code: 'CS100001', business_name: '한식음식점', amount: 600000000, count: 20000},
    {area_code: '3003', area_name: 'C상권', market_type_name: '골목상권', business_code: 'CS100002', business_name: '중식음식점', amount: 700000000, count: 10000}
  ],
  [
    {area_code: '3001', business_code: 'CS100001', store_count: 30},
    {area_code: '3002', business_code: 'CS100001', store_count: 10}
  ],
  {code: 'CS100001', label: '한식음식점'},
  '상권',
  2
), [
  {scope: '상권', area_code: '3002', area_name: 'B상권', market_type_name: '발달상권', amount: 600000000, stores: 10, monthly_sales_per_store: 20000000, customer_unit_price: 30000},
  {scope: '상권', area_code: '3001', area_name: 'A상권', market_type_name: '골목상권', amount: 900000000, stores: 30, monthly_sales_per_store: 10000000, customer_unit_price: 30000}
]);

console.log('build_commercial_view_data test ok');
