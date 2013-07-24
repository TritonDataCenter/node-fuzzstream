/*
 * lib/fuzzstream.js: induce corner-case behavior in a Readable stream consumer.
 */

var mod_assert = require('assert');
var mod_util = require('util');
var mod_stream = require('stream');

/*
 * Use shim for Node v0.8 if necessary.
 */
if (!mod_stream.Transform)
	mod_stream = require('readable-stream');

/* Public interface */
module.exports = FuzzStream;


/*
 * Default parameters.  These should eventually be made configurable once it's
 * clearer what a useful interface would look like.
 */

/* probability that a given chunk will be combined with the next one */
var pCombine = 0.3;

/* probability of getting a 0-byte chunk each time we cut up a large chunk */
var pZero = 0.2;

/* desired distribution of induced delays */
var pDelayDist = [
    { 'p': 0.20, 'min':    0, 'max':    0 },	/* some don't delay at all */
    { 'p': 0.64, 'min':    0, 'max':   10 },	/* most wait up to 10ms */
    { 'p': 0.15, 'min':    0, 'max':  100 },	/* some take a bit longer */
    {            'min': 1000, 'max': 3000 }	/* 1% take a few seconds */
];


/*
 * Default function that's invoked each time we're ready to emit a chunk to
 * determine how long to wait (in milliseconds) before emitting the chunk.  This
 * implementation returns an integer selected randomly according to the given
 * distribution.  See pDelayDist for an example distribution.
 */
function FuzzDelay(dists)
{
	var r = Math.random();
	var c, i, d;

	for (c = 0, i = 0; i < dists.length - 1; i++) {
		if (!dists[i].hasOwnProperty('p'))
			break;

		c += dists[i]['p'];
		if (r < c)
			break;
	}

	mod_assert.ok(i < dists.length);
	d = dists[i];
	return (d['min'] + Math.floor(Math.random() * (d['max'] - d['min'])));
}


/*
 * Default function to divide up a given input chunk.  This implementation
 * selects a random index within the chunk (inclusive of both endpoints),
 * extracts a chunk of that length, and repeats until the whole chunk is
 * accounted-for.  For each iteration, with probability conf['pzero'], a
 * zero-length chunk is inserted instead, though this has no effect on readable
 * consumers, since the parent class ignores these.
 */
function FuzzChunk(conf, chunk)
{
	var rv, r, l;

	rv = [];

	while (chunk.length > 0) {
		r = Math.random();
		if (r < conf['pzero'])
			l = 0;
		else
			l = 1 + Math.floor(Math.random() * chunk.length);
		rv.push(chunk.slice(0, l));
		chunk = chunk.slice(l);
	}

	return (rv);
}

/*
 * FuzzStream is essentially a pass-through stream that re-chunks data and
 * introduces delays in order to exercise corner cases in Readable stream
 * readers.
 */
function FuzzStream()
{
	/* configuration parameters */
	this.fs_pcombine = pCombine;
	this.fs_pzero = pZero;
	this.fs_delayfn = FuzzDelay.bind(null, pDelayDist);
	this.fs_chunkfn = FuzzChunk.bind(null, { 'pzero': this.fs_pzero });

	/* runtime state */
	this.fs_queue = [];			/* queue of chunks to emit */
	this.fs_callback = null;		/* caller callback */

	/* debugging state */
	this.fs_delay = null;			/* timeout handle */
	this.fs_delay_start = null;		/* time we started waiting */
	this.fs_delay_done = null;		/* time we will stop waiting */
	this.fs_nbytesread = 0;			/* total bytes read */
	this.fs_nbyteswritten = 0;		/* total bytes written */

	mod_stream.Transform.call(this);
}

mod_util.inherits(FuzzStream, mod_stream.Transform);

/*
 * Invoked by the Transform abstract class to process a chunk of data.
 */
FuzzStream.prototype._transform = function (chunk, encoding, callback)
{
	var chunks;

	/* The caller doesn't invoke _transform concurrently. */
	mod_assert.ok(this.fs_callback === null);
	this.fs_nbytesread += chunk.length;

	/*
	 * With some probability, we combine this chunk with the next chunk.
	 * To do that, we enqueue the chunk and invoke the callback immediately,
	 * relying on a subsequent call to _transform (or _flush) to concatenate
	 * the chunk and flush the queue.
	 */
	if (Math.random() < this.fs_pcombine) {
		this.fs_queue.push(chunk);
		process.nextTick(callback);
		return;
	}

	/*
	 * If there are some enqueued chunks from previous invocations,
	 * concatenate them all now.
	 */
	if (this.fs_queue.length > 0)
		this.fs_queue = [ Buffer.concat(this.fs_queue) ];

	/*
	 * Divide up this chunk, enqueue the resulting smaller chunks, save the
	 * callback so we can invoke it when we're done, and then start flushing
	 * the queue.
	 */
	chunks = chunk.length === 0 ? [ '' ] : this.fs_chunkfn(chunk);
	mod_assert.ok(chunks.length > 0);
	this.fs_queue.push.apply(this.fs_queue, chunks);
	this.fs_callback = callback;
	this.flushQueue();
};

/*
 * Invoked by the Transform abstract class when there's no more data left to
 * process.  This is our last chance to emit data that we've been holding onto.
 */
FuzzStream.prototype._flush = function (callback)
{
	mod_assert.ok(this.fs_callback === null);

	if (this.fs_queue.length === 0) {
		process.nextTick(callback);
		return;
	}

	this.fs_callback = callback;
	this.flushQueue();
};

/*
 * Emit enqueued chunks, using whatever random delays are configured between
 * chunks.
 */
FuzzStream.prototype.flushQueue = function ()
{
	var s = this;
	var delay;

	/*
	 * We should never be called concurrently during a single (asynchronous)
	 * _transform() operation, and _transform() is not called concurrently.
	 * Additionally, we're only ever called when there's something enqueued
	 * for us to emit.
	 */
	mod_assert.ok(this.fs_delay === null);
	mod_assert.ok(this.fs_queue.length > 0);

	delay = this.fs_delayfn();
	if (delay === 0) {
		this.emitHead();
	} else {
		this.fs_delay_start = Date.now();
		this.fs_delay_done = this.fs_delay_start + delay;
		this.fs_delay = setTimeout(function () {
			s.fs_delay_start = null;
			s.fs_delay_done = null;
			s.fs_delay = null;
			s.emitHead();
		}, delay);
	}
};

/*
 * Emit the first enqueued chunk immediately.  If there's more to emit, kick
 * that off asynchronously.  If not, invoke the callback we saved in
 * _transform().
 */
FuzzStream.prototype.emitHead = function ()
{
	var buf, cb;

	mod_assert.ok(this.fs_queue.length > 0);
	buf = this.fs_queue.shift();
	this.fs_nbyteswritten += buf.length;
	this.push(buf);

	if (this.fs_queue.length > 0) {
		this.flushQueue();
	} else {
		mod_assert.ok(this.fs_callback !== null);
		cb = this.fs_callback;
		this.fs_callback = null;
		cb();
	}
};
