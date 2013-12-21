// mocha-cloud inspired saucelabs runner - MIT licensed

var Emitter = require('events').EventEmitter;
var debug = require('debug')('zuul:sauce');
var Batch = require('batch');
var wd = require('wd');

module.exports = CloudBrowser;

/**
 * Initialize a cloud test with
 * project `name`, your saucelabs username / key.
 *
 * @param {String} name
 * @param {String} user
 * @param {String} key
 * @api public
 */

function CloudBrowser(opt) {
  this.user = opt.user;
  this.key = opt.key;

  this._tags = [];

  this._conf = {
    tags: [],
    name: opt.name,
    build: opt.build,
    browserName: opt.browser,
    version: opt.version,
    platform: opt.platform
  };
}

CloudBrowser.prototype.__proto__ = Emitter.prototype;

CloudBrowser.prototype.quit = function(code, cb) {
  var self = this;

  var browser = self._browser;
  browser.quit();
  browser.sauceJobStatus(!code, cb);
};

CloudBrowser.prototype.open = function(url, fn) {
  var self = this;

  var conf = self._conf;

  debug('queuing %s %s %s', conf.browserName, conf.version, conf.platform);
  var browser = wd.remote('ondemand.saucelabs.com', 80, self.user, self.key);

  browser.init(conf, function(err) {
    if (err) {
      return fn(err);
    }

    debug('starting %s %s %s', conf.browserName, conf.version, conf.platform);
    debug('open %s', url);
    browser.get(url, fn);
  });

  // TODO poll browser with eval to know if session has died

  self._browser = browser;
  return browser;
      /*
    browser.get(self._url, function(err){
      if (err) return done(err);

      debug('opened');

      function onexit() {
        browser.quit();
      }

      function wait() {
        console.log('eval request');
        browser.eval('window.zuul_results', function(err, res) {
          console.log('cb', err, res);
          if (err) return done(err);

          console.log('??');
          if (!res) {
            console.log('waiting');
            debug('waiting for results');
            setTimeout(wait, 1000);
            return;
          }

          process.removeListener('exit', onexit);

          // we require that zuul_results contain a field
          // `passed` to indicate if all tests passed
          debug('results %j', res);
          self.emit('end', conf, res);
          browser.sauceJobStatus(res.passed, function(err) {
            browser.quit();
            done(err, res);
          });
        });
      }

      wait();
    });
  });
  */
};
