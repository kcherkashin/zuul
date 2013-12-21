var eio = require('engine.io-client');
var JSON = require('JSON2');
var load_script = require('load-script');

// assigned by zuul so it knows which browser these tests are for
var browser_id = zuul.browser_id;

// convert zuul mocha ui's to our ui
var ui_map = {
    'mocha-bdd': 'bdd',
    'mocha-qunit': 'qunit',
    'mocha-tdd': 'tdd'
};

mocha.setup({
    ui: ui_map[zuul.ui]
});

// force polling for now
// ie10 seems to disconnect early without it
// too many factors here between localtunnel, engine.io and shitty browser
var socket = eio({ path: '/__zuul/eio', transports: ['polling'] });
socket.onopen = function() {
    window.onerror = function(msg, file, line) {
        socket.send(msg + ':' + line);
    };

    // identify this connection only if we have a browser id
    if (browser_id) {
        socket.send(JSON.stringify({
            type: 'browser id',
            browser_id: browser_id
        }));
    }

    socket.onclose = function(msg) {
        // what should be done if we disconnect too early?
    };

    load_script('/__zuul/test-bundle.js', run_tests);
};

var harness = mocha;
if (harness.checkLeaks) {
    harness.checkLeaks();
}

function run_tests() {
    var stats = {
        failed: 0,
        passed: 0
    };

    var suite = harness.suite;
    if (suite.suites.length === 0 && suite.tests.length === 0) {
        socket.send(JSON.stringify({
            type: 'done',
            browser_id: browser_id,
            results: stats
        }));
        return;
    }

    var runner = harness.run();

    runner.on('pass', function(test) {
        stats.passed++;
    });

    runner.on('fail', function(test, err) {
        stats.failed++;
    });

    runner.on('end', function() {
        // so the only additional thing is we need to know for what browser
        // this was for
        socket.send(JSON.stringify({
            type: 'done',
            browser_id: browser_id,
            results: stats
        }), function() {
            socket.close();
        });
    });
}
