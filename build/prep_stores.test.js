const assert = require('assert');
const {summarizeCsv} = require('./prep_stores');

const csv = [
  '시도명,시군구명,법정동명,상호명,상권업종중분류명,상권업종소분류명,도로명주소,위도,경도',
  '서울,성동구,성수동1가,성수커피,음식,커피전문점,서울 성동구 성수로,37.544,127.055',
  '서울,성동구,성수동1가,성수필라테스,스포츠,필라테스,서울 성동구 연무장길,37.545,127.056',
  '서울특별시,마포구,연남동,연남김밥,음식,김밥,서울 마포구 동교로,37.561,126.924',
  '서울,마포구,연남동,셀프라면무인점포,소매,무인점포,서울 마포구 성미산로,37.562,126.925',
  '경기,성남시,정자동,분당커피,음식,커피전문점,경기 성남시,37.36,127.11'
].join('\n');

const out = summarizeCsv(csv, '2026-09-23');

assert.equal(out.source_rows, 4);
assert.equal(out.totals.cafe, 1);
assert.equal(out.totals.fitness, 1);
assert.equal(out.totals.food, 1);
assert.equal(out.totals.unmanned, 1);
assert.equal(out.gu.find(g => g.gu === '성동구').counts.cafe, 1);
assert.equal(out.dong.find(d => d.gu === '마포구' && d.dong === '연남동').counts.food, 1);
assert.equal(out.points['성동구/성수동1가'].cafe[0].n, '성수커피');
assert.equal(out.points['성동구/성수동1가'].cafe[0].lat, 37.544);
assert(!out.gu.some(g => g.gu === '성남시'));

console.log('prep_stores test ok');
