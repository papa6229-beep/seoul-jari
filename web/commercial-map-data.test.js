const assert = require('node:assert/strict');
const test = require('node:test');
const {linkedDongs, storeKeys, pointsFor} = require('./commercial-map-data');

test('links legacy statistics to only the verified current dong names', () => {
  assert.deepEqual(linkedDongs('11230536'), ['용두동', '신설동']);
  assert.deepEqual(linkedDongs('11680740'), ['개포3동']);
  assert.deepEqual(linkedDongs('11740520'), ['상일1동']);
  assert.deepEqual(storeKeys({code: '11740520', gu: '강동구', name: '상일동'}), ['강동구/상일1동']);
  assert.equal(linkedDongs('11740525'), null);
});

test('combines split dong pins without taking neighboring dong pins', () => {
  const points = {
    '동대문구/용두동': {cafe: [{n: '용두 카페'}]},
    '동대문구/신설동': {cafe: [{n: '신설 카페'}]},
    '강동구/상일1동': {cafe: [{n: '상일1 카페'}]},
    '강동구/상일2동': {cafe: [{n: '상일2 카페'}]}
  };
  assert.deepEqual(pointsFor(points, {code: '11230536', gu: '동대문구', name: '용신동'}, 'cafe').map(p => p.n),
    ['용두 카페', '신설 카페']);
  assert.deepEqual(pointsFor(points, {code: '11740520', gu: '강동구', name: '상일동'}, 'cafe').map(p => p.n),
    ['상일1 카페']);
});

test('keeps existing single-dong fallback behavior', () => {
  const points = {'송파구/잠실동': {cafe: [{n: '잠실 카페'}]}};
  assert.deepEqual(pointsFor(points, {code: '11710670', gu: '송파구', name: '잠실2동'}, 'cafe').map(p => p.n),
    ['잠실 카페']);
});
