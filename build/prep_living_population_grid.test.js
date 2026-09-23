const assert = require('assert');
const {epsg5179ToWgs84} = require('./prep_living_population_grid');

const point = epsg5179ToWgs84(954625, 1940625);
assert.ok(point.lon > 126 && point.lon < 128);
assert.ok(point.lat > 37 && point.lat < 38);
assert.ok(Math.abs(point.lon - 126.9865) < 0.001);
assert.ok(Math.abs(point.lat - 37.4642) < 0.001);

console.log('prep_living_population_grid test ok');
