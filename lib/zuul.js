var format = require('util').format;
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('zuul');
var bouncy = require('bouncy');
var colors = require('colors');
var engine = require('engine.io');
var Batch = require('batch');
var uuid = require('uuid');

var tunnel = require('./tunnel');
var Cloud = require('./sauce-cloud');
var CloudBrowser = require('./cloud_browser');
var control_app = require('./control-app');
var user_server = require('./user-server');
var expand_browsers = require('./browsers.js');

var frameworks = require('../frameworks');

module.exports = function(config) {
    var ui = config.ui;

    var ui_map = {
        'mocha-bdd': 'mocha',
        'mocha-qunit': 'mocha',
        'mocha-tdd': 'mocha'
    };

    ui = ui_map[ui] || ui;

    var framework = frameworks[ui];
    if (!framework) {
        throw new Error('unsupported ui: ' + ui);
    }

    config.framework = framework;

    var control_server = control_app(config).listen(0, function() {
        debug('control server active on port %d', control_server.address().port);
    });

    var eio = engine.attach(control_server, {
        path: '/__zuul/eio'
    });

    var emitter = new EventEmitter();

    // each connection needs to establish what browser is being tested
    // this will be provided via the url?
    // what if nothing provided? then local testing?
    eio.on('connection', function (socket) {
        var browser_id = undefined;
        debug('browser client connected');

        socket.on('message', function (msg) {
            try {
                msg = JSON.parse(msg);
            } catch (err) {
                debug('failed to parse client json, closing');
                socket.close();
            }

            debug('> %j', msg);
            if (msg.type === 'browser id') {
                browser_id = msg.browser_id;
                debug('browser identified %s', browser_id);
                return;
            }
            else if (msg.type === 'done') {
                emitter.emit(msg.browser_id, msg.results);
                return;
            }

            debug('unknown message type: %s', msg.type);
        });

        socket.on('close', function () {
            // this is how we know if test terminated early?
            debug('browser connection closed %s', browser_id);
            // TODO emit failure for browser if we close prematurely
            //emitter.emit(browser_id, {});
        });
    });

    // load framework based on selected ui
    // TODO(shtylman) make this pluggable

    // TODO custom server provided by user
    var custom_server = undefined;

    if (config.server) {
        custom_server = user_server(config.server);
    }

    var bouncer_port = 0;
    if (config.local && parseInt(config.local)) {
        bouncer_port = config.local;
    }

    var bouncer = bouncy(function (req, res, bounce) {
        var url = req.url.split('?')[0];
        if (!custom_server || url.split('/')[1] === '__zuul') {
            bounce(control_server.address().port, { headers: { connection: 'close' }});
            return;
        }

        bounce(custom_server.port, { headers: { connection: 'close' }});
    });

    bouncer.listen(bouncer_port, bouncer_active);

    function bouncer_active() {
        var app_port = bouncer.address().port;
        debug('bouncer active on port %d', app_port);

        // don't start any tunnel things
        if (config.local) {

            // no localtunnel requested
            if (!config.tunnel) {
                var url = 'http://localhost:' + app_port + '/__zuul';
                console.log('open the following url in a browser:');
                console.log(url);
                return;
            }

            tunnel(app_port, function(err, url) {
                if (err) {
                    return console.error(err.stack);
                }

                url = url + '/__zuul';
                console.log('open the following url in a browser:');
                console.log(url);
            });

            return;
        }

        // config the cloud based
        //var cloud = new Cloud(config.name, config.username, config.key);

        // TODO(shtylman) make configurable? detect automatically?
        //cloud.concurrency(3);
        //cloud.build(process.env.TRAVIS_BUILD_NUMBER);

        expand_browsers(config.browsers || [], function(err, browsers) {
            if (err) {
                console.error(err.stack);
                return;
            }

            var to_test = [];

            var by_os = {};
            browsers.forEach(function(browser) {
                to_test.push(browser);
                //cloud.browser(browser.name, browser.version, browser.platform);
                var key = browser.name + ' @ ' + browser.platform;
                (by_os[key] = by_os[key] || []).push(browser.version);
            });

            for (var item in by_os) {
                console.log('  - testing: %s: %s'.grey, item, by_os[item].join(' '));
            }

            var tunnel_client = tunnel(app_port, function(err, url) {
                if (err) {
                    return console.error(err.stack);
                }

                var url = url + '/__zuul';
                debug('tunnel url %s', url);

                var failed = 0;

                var batch = new Batch();
                batch.concurrency(3);

                to_test.forEach(function(info) {
                    batch.push(function(done) {
                        test_browser(info, done);
                    });
                });

                batch.end(function(err) {
                    debug('all tests run');
                    if (err) {
                        console.error(err.stack);
                    }

                    process.exit(failed);
                });

                function test_browser(browser, done) {

                    debug('testing %j', browser);

                    var uid = uuid();

                    var browser_url = url + '?__zuul_id=' + uid;

                    debug('url %s', browser_url);

                    var browser = new CloudBrowser({
                        name: config.name,
                        user: config.username,
                        key: config.key,
                        build: process.env.TRAVIS_BUILD_NUMBER,
                        browser: browser.name,
                        version: browser.version,
                        platform: browser.platform
                    });

                    // this browser's results
                    emitter.once(uid, function(results) {
                        debug('results %j', results);
                        failed += results.failed;

                        var total = results.passed + results.failed;
                        console.log('%d tests finished. %d failed', total, results.failed);
                        browser.quit(results.failed, done);

                        // could actually wait for socket disconnect, but whatever
                    });

                    browser.open(browser_url, function(err) {
                        if (err) {
                            return done(err);
                        }
                    });
                }
            });

            return;
            // init the cloud browser
            // open the requested url
            // wait for browser finish from control emitter above
            // report test status

            var by_os = {};
            browsers.forEach(function(browser) {
                cloud.browser(browser.name, browser.version, browser.platform);
                var key = browser.name + ' @ ' + browser.platform;
                (by_os[key] = by_os[key] || []).push(browser.version);
            });

            for (var item in by_os) {
                console.log('  - testing: %s: %s'.grey, item, by_os[item].join(' '));
            }

            // ask localtunnel for a tunnel so we can test on sauce
            var tunnel_client = tunnel(app_port, function(err, url) {
                if (err) {
                    return console.error(err.stack);
                }

                var url = url + '/__zuul';
                var have_failed = false;

                // we could encode the browser info in the url?
                // make an ID for the browser
                // and then when we get a response, mark as done
                // without this id, we won't know
                debug('tunnel url %s', url);

                cloud.on('init', function(browser) {
                    console.log('  - queuing: %s'.white, browser_to_s(browser));
                });

                cloud.on('start', function(browser) {
                    console.log('  - starting: %s'.yellow, browser_to_s(browser));
                });

                cloud.on('end', function(browser, res) {
                    var passed = res.passed;
                    have_failed = have_failed || !res.passed;

                    if (passed) {
                        console.log('  - passed: %s'.green, browser_to_s(browser));
                        return;
                    }
                    console.log('  - failed: %s: %d failures'.red, browser_to_s(browser), res.failures);
                });

                cloud.on('error', function(err) {
                    console.error('%s'.red, err.message);
                });

                // shit.. instead of having cloud manage browsers, we need to do that now
                // so we can mark done or not
                // each browser gets a unique id
                url += '?zuul_browser_id=' + 'foobar';

                cloud.url(url);
                cloud.start(function(err) {
                    if (err) {
                        console.error('cloud failure: %s'.red, err.message);
                        return process.exit(1);
                    }

                    if (have_failed) {
                        console.log('  - tests failed'.red);
                    }
                    else {
                        console.log('  - all passed'.green);
                    }
                    setTimeout(process.exit.bind(process), 1000, (have_failed) ? 1 : 0);
                });
            });
        });
    };
};

// return a nice string for the browser
// browser v# (platform)
function browser_to_s(browser) {
    return format('%s v%s (%s)', browser.browserName, browser.version, browser.platform);
}
