const assert = require('assert');
const {coverageStatus, referenceSalesStatus} = require('./build_commercial_coverage');

assert.deepEqual(referenceSalesStatus({
  has_sales: false,
  reference_sales_scopes: ['signgu', 'mega']
}), {
  has_reference_sales: true,
  reference_sales_label: '참고 매출 있음',
  reference_sales_scopes: ['signgu', 'mega']
});

assert.deepEqual(
  coverageStatus({has_sales: true, has_stores: true, has_map_points: true}),
  {
    coverage_level: 'complete',
    coverage_label: '매출·점포·지도 모두 있음',
    recommended_action: '상품 화면에서 매출, 경쟁, 지도 분석까지 바로 사용할 수 있습니다.'
  }
);

assert.deepEqual(
  coverageStatus({has_sales: false, has_stores: true, has_map_points: true}),
  {
    coverage_level: 'needs_private_sales',
    coverage_label: '공공 매출 없음 · 점포·지도 있음',
    recommended_action: '공공 매출은 미제공입니다. 점포·수요·지도 중심으로 보여주고, 민간 카드 매출 보강 후보로 표시합니다.'
  }
);

assert.deepEqual(
  coverageStatus({has_sales: false, has_stores: true, has_map_points: false}),
  {
    coverage_level: 'needs_map',
    coverage_label: '점포 집계 있음 · 지도핀 부족',
    recommended_action: '공공 매출과 실제 위치 좌표가 부족합니다. 우선 점포 수와 수요만 참고하도록 표시합니다.'
  }
);

console.log('build_commercial_coverage test ok');
