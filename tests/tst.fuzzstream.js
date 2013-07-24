/*
 * tst.fuzzstream.js: test FuzzStream class by passing a large file through it
 */

var mod_assert = require('assert');
var mod_crypto = require('crypto');
var mod_fs = require('fs');
var mod_path = require('path');

var FuzzStream = require('../lib/fuzzstream');

var testfile = process.env['SHELL'];
var start = Date.now();

var fsstream = mod_fs.createReadStream(testfile);
var fsmd5 = mod_crypto.createHash('md5');
var nfschunks = 0;
var nfsbytes = 0;

var fuzzstream = new FuzzStream();
var fuzzmd5 = mod_crypto.createHash('md5');
var nfuzzchunks = 0;
var nfuzzbytes = 0;

console.error('using test file "%s"', testfile);

fsstream.pipe(fuzzstream);

fsstream.on('data', function (chunk) {
	nfschunks++;
	nfsbytes += chunk.length;
	fsmd5.update(chunk);
});

fuzzstream.on('data', function (chunk) {
	nfuzzchunks++;
	nfuzzbytes += chunk.length;
	fuzzmd5.update(chunk);
});

fuzzstream.on('end', function () {
	var fshash = fsmd5.digest('base64');
	var fuzzhash = fuzzmd5.digest('base64');

	console.error('elapsed time: %d ms', Date.now() - start);
	console.error(' raw nchunks: %d', nfschunks);
	console.error(' raw   bytes: %s', nfsbytes);
	console.error(' raw     md5: %s', fshash);
	console.error('fuzz nchunks: %d', nfuzzchunks);
	console.error('fuzz   bytes: %s', nfuzzbytes);
	console.error('fuzz     md5: %s', fuzzhash);
	mod_assert.equal(fshash, fuzzhash);
	console.error('md5sum matched');
	console.error('TEST PASSED');
});
