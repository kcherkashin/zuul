var http = require('http');
var load_script = require('load-script');
var JSON = global.JSON || require('JSON2');

try {
  var stack_mapper = require('stack-mapper');
} catch (err) {};

// convert zuul mocha ui's to our ui
var ui_map = {
  'mocha-bdd': 'bdd',
  'mocha-qunit': 'qunit',
  'mocha-tdd': 'tdd'
};

// TODO(shtylman) setup mocha?
mocha.setup({
  ui: ui_map[zuul.ui]
});

var harness = window.mochaPhantomJS || mocha;
if (harness.checkLeaks) {
  harness.checkLeaks();
}

load_script('/__zuul/test-bundle.js', run);

function run(err) {
  if (err) {
    window.zuul_results = {
      failures: 0,
      passed: false
    };
    return;
  }

  if (!stack_mapper) {
    return do_run();
  }

  var map = undefined;
  var mapper = undefined;

  var opt = {
    path: '/__zuul/test-bundle.map.json'
  };

  http.get(opt, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });

    res.on('end', function() {
      map = JSON.parse(body);
      mapper = stack_mapper(map);
      do_run();
    });
  });

  function do_run() {

    var runner = harness.run();

    var suite = harness.suite;
    if (suite.suites.length === 0 && suite.tests.length === 0) {
      window.zuul_results = {
        failures: 0,
        passed: false
      };
    }

    var failed = [];

    var tracekit = require('tracekit');
    tracekit.collectWindowErrors = false;

    runner.on('fail', function(test, err) {

      var report = tracekit.computeStackTrace(err);

      var stack = report.name + ': ' + report.message;

      var stacks = report.stack;
      for (var i = 0; i <stacks.length; ++i) {
        var item = stacks[i];

        stack += '\n\tat ' + item.func + ' (' + item.url + ':' + item.line;

        if (item.column) {
          stack += ':' + item.column;
        }
        else {
          stack += ':0';
        }

        stack += ')';
      }

      // firefox stack traces will cause this to fail
      if (mapper && stack) {
        var include_source = false;
        var info = mapper.map(stack, include_source);
        err.stack = info.stack;
      }

      failed.push({
        title: test.title,
        fullTitle: test.fullTitle(),
        error: {
          message: err.message,
          stack: err.stack
        }
      });
    });

    runner.on('end', function(){
      runner.stats.failed = failed;
      runner.stats.passed = failed.length === 0;
      window.zuul_results = runner.stats;
    });
  };
}
