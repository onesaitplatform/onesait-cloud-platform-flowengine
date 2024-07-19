var parse = require('../index');
var assert = require('chai').assert;

function parseTest(input, expected) {
	describe('"' + input + '"', function() {
		it('should parse', function() {
			assert.deepEqual(parse(input), expected);
		});
	});
}

describe('DMS pairs with different separators, hemisphere at end', function() {
	var testData = [
		'59°12\'7.7"N 02°15\'39.6"W',
		'59°12\'7.7”N 02°15\'39.6”W',
		'59°12\'7.7“N 02°15\'39.6“W',
		'59º12\'7.7"N 02º15\'39.6"W',
		'59 12\' 7.7" N 02 15\' 39.6" W',
		'59 12\'7.7\'\'N 02 15\'39.6\'\' W',
		'59:12:7.7"N 2:15:39.6W',
		'59 12’7.7’’N 02 15’39.6’’W'
	];

	var expected = {
		lat: 59 + 12 / 60 + 7.7 / 3600,
		lon: -1 * (2 + 15 / 60 + 39.6 / 3600)
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});

describe('Simple DMS pairs (rough user-input style)', function() {
	parseTest('1W2N', {lat: 2, lon: -1});
	parseTest('1E2N', {lat: 2, lon: 1});
	parseTest('1W2S', {lat: -2, lon: -1});
	parseTest('1E2S', {lat: -2, lon: 1});
	parseTest('-1.1W-2.1N', {lat: -2.1, lon: 1.1});
	parseTest('-1.1E-2.1N', {lat: -2.1, lon: -1.1});
	parseTest('-1.1W-2.1S', {lat: 2.1, lon: 1.1});
	parseTest('-1.1E-2.1S', {lat: 2.1, lon: -1.1});
	parseTest('-2.1N-1.1W', {lat: -2.1, lon: 1.1});
	parseTest('-2.1N-1.1E', {lat: -2.1, lon: -1.1});
	parseTest('-2.1S-1.1W', {lat: 2.1, lon: 1.1});
	parseTest('-2.1S-1.1E', {lat: 2.1, lon: -1.1});
	parseTest('12.34,56.78', {lat: 12.34, lon: 56.78});
	parseTest('-12.34,-56.78', {lat: -12.34, lon: -56.78});
});

describe('Hemisphere inference from other coordinate', function() {
	parseTest('1,2N', {lat: 2, lon: 1});
	parseTest('1,2N', {lat: 2, lon: 1});
	parseTest('1,2S', {lat: -2, lon: 1});
	parseTest('1,2S', {lat: -2, lon: 1});
	parseTest('2N,1', {lat: 2, lon: 1});
	parseTest('2N,1', {lat: 2, lon: 1});
	parseTest('2S,1', {lat: -2, lon: 1});
	parseTest('2S,1', {lat: -2, lon: 1});

	parseTest('1,2E', {lat: 1, lon: 2});
	parseTest('1,2E', {lat: 1, lon: 2});
	parseTest('1,2W', {lat: 1, lon: -2});
	parseTest('1,2W', {lat: 1, lon: -2});
	parseTest('2E,1', {lat: 1, lon: 2});
	parseTest('2E,1', {lat: 1, lon: 2});
	parseTest('2W,1', {lat: 1, lon: -2});
	parseTest('2W,1', {lat: 1, lon: -2});
});

describe('DMS pairs with hemisphere at beginning', function() {
	var testData = [
		'N59°12\'7.7" W02°15\'39.6"',
		'W02°15\'39.6" N59°12\'7.7"'
	];

	var expected = {
		lat: 59 + 12 / 60 + 7.7 / 3600,
		lon: -1 * (2 + 15 / 60 + 39.6 / 3600)
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});

describe('Various separators between lat / lon pairs', function() {
	var testData = [
		'59°12\'7.7"N  02°15\'39.6"W',
		'59°12\'7.7"N , 02°15\'39.6"W',
		'59°12\'7.7"N,02°15\'39.6"W'
	];

	var expected = {
		lat: 59 + 12 / 60 + 7.7 / 3600,
		lon: -1 * (2 + 15 / 60 + 39.6 / 3600)
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});

describe('single coordinate with hemisphere', function() {
	var testData = [
		'59°12\'7.7"N',
		'02°15\'39.6"W'
	];

	var expected = [
		{lat: 59 + 12 / 60 + 7.7 / 3600},
		{lon: -1 * (2 + 15 / 60 + 39.6 / 3600)}
	];

	testData.forEach(function(input, i) {
		parseTest(input, expected[i]);
	});
});

describe('Single coordinate with no hemisphere', function() {
	var testData = [
		'12.123',
		'59°12\'7.7"',
		'02°15\'39.6"',
		'-02°15\'39.6"'
	];

	var expected = [
		12.123,
		59 + 12 / 60 + 7.7 / 3600,
		2 + 15 / 60 + 39.6 / 3600,
		-1 * (2 + 15 / 60 + 39.6 / 3600)
	];

	testData.forEach(function(input, i) {
		parseTest(input, expected[i]);
	});
});

describe('Infer first coordinate is lat, second lon, if no hemisphere letter is included', function() {
	var testData = [
		'59°12\'7.7" -02°15\'39.6"',
		'59°12\'7.7", -02°15\'39.6"',
	];

	var expected = {
		lat: 59 + 12 / 60 + 7.7 / 3600,
		lon: -1 * (2 + 15 / 60 + 39.6 / 3600)
	};

	testData.forEach(function(input, i) {
		parseTest(input, expected);
	});
});

describe('Throws when input invalid', function() {
	assert.throws(function() { parse('Not DMS string'); }, /Could not parse string/);
	assert.throws(function() { parse('59°65\'7.7" -02°15\'39.6"'); }, /Minutes out of range/);
	assert.throws(function() { parse('59°12\'65.5" -02°15\'39.6"'); }, /Seconds out of range/);
});

describe('DMS with decimal minutes', function() {
	var testData = [
		'N59°12.105\' W02°15.66\''
	];

	var expected = {
		lat: 59 + 12.105 / 60,
		lon: -1 * (2 + 15.66 / 60)
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});

describe('Parse DMS with no minutes or seconds', function() {
	var testData = [
		'59°N 02°W'
	];

	var expected = {
		lat: 59,
		lon: -2
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});

describe('Parse decimal degrees as decimal degrees', function() {
	var testData = [
		'51.5, -0.126',
		'51.5,-0.126',
		'51.5 -0.126'
	];

	var expected = {
		lat: 51.5,
		lon: -0.126
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});

describe('Parse DMS with separators and spaces', function() {
	var testData = [
		'59° 12\' 7.7" N 02° 15\' 39.6" W',
		'59º 12\' 7.7" N 02º 15\' 39.6" W',
		'59 12’ 7.7’’N 02 15’ 39.6’’W'
	];

	var expected = {
		lat: 59 + 12 / 60 + 7.7 / 3600,
		lon: -1 * (2 + 15 / 60 + 39.6 / 3600)
	};

	testData.forEach(function(input) {
		parseTest(input, expected);
	});
});
