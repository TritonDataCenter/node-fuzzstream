/*
 * examples/fuzzstream.js: basic FuzzStreams example
 */

var FuzzStream = require('../lib/fuzzstream');

var start, stream;

start = Date.now();
console.log('%dms: start', Date.now() - start);

/* Defaults: randomly chunk up data and induce propagation delays up to 3s. */
stream = new FuzzStream();
stream.on('data', function (chunk) {
	console.log('%dms: "%s"', Date.now() - start, chunk.toString('utf8'));
});
stream.on('end', function () {
	console.log('%dms: end', Date.now() - start);
});

stream.write('What a piece of work is man. ');
stream.write('How noble in reason, how infinite in faculty, ');
stream.write('in action how like an angel, ');
stream.write('in apprehension how like a god!');
stream.write('');
stream.end('End transmission.');
