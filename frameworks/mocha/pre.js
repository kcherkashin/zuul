var eio = require('engine.io-client');
var win = window;

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

var socket = eio({ path: '/__zuul/eio' });
socket.onopen = function() {
  console.log('opened');

  // load test bundle
  var script = document.createElement('script');
  script.onload = run_tests;
  script.async = true;
  script.src = '/__zuul/test-bundle.js';
  document.body.appendChild(script);

  socket.onclose = function() {
    console.log('closed');
    // TODO??
  };
};

var harness = global.mochaPhantomJS || mocha;
if (harness.checkLeaks) {
  harness.checkLeaks();
}

function run_tests() {
  var suite = harness.suite;
  if (suite.suites.length === 0 && suite.tests.length === 0) {
    // no tests to run
    // TODO report done
    return;
  }

  var runner = harness.run();

  var failed = [];

  runner.on('pass', function(test) {
  });

  runner.on('fail', function(test, err) {
    failed.push({
      title: test.title,
      fullTitle: test.fullTitle(),
      error: {
        message: err.message,
        stack: err.stack
      }
    });
  });

  runner.on('end', function() {
    console.log('done');
    runner.stats.failed = failed;
    runner.stats.passed = failed.length === 0;
    //win.zuul_results = runner.stats;

    // so the only additional thing is we need to know for what browser
    // this was for
    socket.send(JSON.stringify({
      type: 'done',
      browser_id: browser_id,
      results: runner.stats
    }));
  });
}


