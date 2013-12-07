var win = window;

var harness = window.mochaPhantomJS || mocha;
if (harness.checkLeaks) {
  harness.checkLeaks();
}

var runner = harness.run();

var suite = harness.suite;
if (suite.suites.length === 0 && suite.tests.length === 0) {
  window.zuul_results = {
    failures: 0,
    passed: false
  };
}

// Listen to `runner` events to populate a global
// `.mochaResults` var which may be used by selenium
// to report on results.

var failed = [];

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

var socket = require('engine.io-client')({ path: '/__zuul/eio' });
socket.onopen = function(){
  console.log('opened');

  socket.onmessage = function(data){
    console.log('msg');
  };

  socket.onclose = function(){};
};

runner.on('end', function() {
  var div = document.createElement('div');
  div.innerHTML = 'done all';
  document.body.appendChild(div);

  runner.stats.failed = failed;
  runner.stats.passed = failed.length === 0;
  win.zuul_results = runner.stats;

  // so the only additional thing is we need to know for what browser
  // this was for
  socket.send(JSON.stringify({
    type: 'done',
    results: runner.stats
  }));

  zuul_results = runner.stats;
});
