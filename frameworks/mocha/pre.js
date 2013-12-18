var eio = require('engine.io-client');
var win = window;

// convert zuul mocha ui's to our ui
var ui_map = {
  'mocha-bdd': 'bdd',
  'mocha-qunit': 'qunit',
  'mocha-tdd': 'tdd'
};

mocha.setup({
  ui: ui_map[zuul.ui]
});

var harness = global.mochaPhantomJS || mocha;
if (harness.checkLeaks) {
  harness.checkLeaks();
}

var socket = eio({ path: '/__zuul/eio' });
socket.onopen = function() {
  console.log('opened');

  socket.onmessage = function(data){
    console.log('msg');
  };

  socket.onclose = function(){};
};

var runner = harness.run();

var suite = harness.suite;
if (suite.suites.length === 0 && suite.tests.length === 0) {
  window.zuul_results = {
    failures: 0,
    passed: false
  };
}

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

// so.. now the question is ...
// what do we do for identifying which browser results we got back?

runner.on('end', function() {
  runner.stats.failed = failed;
  runner.stats.passed = failed.length === 0;
  win.zuul_results = runner.stats;

  // so the only additional thing is we need to know for what browser
  // this was for
  socket.send(JSON.stringify({
    type: 'done',
    results: runner.stats
  }));
});
