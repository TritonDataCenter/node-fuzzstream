# fuzzstream: Induce corner-case behavior in a Readable stream consumer

fuzzstream is a pass-through stream that re-chunks incoming data and induces
arbitrary delays before propagating data in order to exercise corner cases in
Readable stream consumers.

## Example

    $ cat examples/fuzzstream.js
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


    $ node examples/fuzzstream.js 
    1ms: start
    31ms: "What a piece of work is man"
    32ms: ". "
    32ms: "How noble in reason, how infinite in faculty, in action how like an
    angel, "
    43ms: "in apprehension how li"
    55ms: "ke"
    147ms: " a god!"
    168ms: "End transmission."
    168ms: end

## Contributions

Pull requests should be "make prepush" clean.
