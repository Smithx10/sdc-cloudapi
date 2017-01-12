/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Main CloudAPI Server file.
 *
 * ./build/node/bin/node main.js \
 *      -f ./etc/cloudapi.cfg 2>&1 | ./node_dules/.bin/bunyan
 */

var assert = require('assert-plus');
var fs = require('fs');
var http = require('http');
var https = require('https');
var path = require('path');

var bunyan = require('bunyan');
var nopt = require('nopt');
var restify = require('restify');
var RequestCaptureStream = restify.bunyan.RequestCaptureStream;

var app = require('./lib').app;
var mod_config = require('./lib/config.js');


// --- Globals

var LOG;
var PARSED;

var opts = {
    'debug': Boolean,
    'file': String,
    'port': Number,
    'help': Boolean
};

var shortOpts = {
    'd': ['--debug'],
    'f': ['--file'],
    'p': ['--port'],
    'h': ['--help']
};



///--- Helpers

function setupLogger(config) {
    assert.object(config.bunyan, 'config.bunyan');
    assert.optionalString(config.bunyan.level, 'config.bunyan.level');
    var cfg_b = config.bunyan;
    var level = cfg_b.level || LOG.level();

    LOG = bunyan.createLogger({
        name: 'cloudapi',
        serializers: restify.bunyan.serializers,
        src: Boolean(bunyan.resolveLevel(level) <= bunyan.TRACE),
        streams: [
            {
                level: level,
                stream: process.stderr
            },
            {
                type: 'raw',
                stream: new RequestCaptureStream({
                    level: bunyan.WARN,
                    maxRecords: 100,
                    maxRequestIds: 100,
                    streams: [ {
                        level: level,
                        stream: process.stderr
                    } ]
                })
            }
        ]
    });

}

function usage(code, message) {
    var _opts = '';
    Object.keys(shortOpts).forEach(function (k) {
        var longOpt = shortOpts[k][0].replace('--', '');
        var type = opts[longOpt].name || 'string';
        if (type && type === 'boolean') {
            type = '';
        }
        type = type.toLowerCase();

        _opts += ' [--' + longOpt + ' ' + type + ']';
    });

    var msg = (message ? message + '\n' : '') +
        'usage: ' + path.basename(process.argv[1]) + _opts;

    process.stderr.write(msg + '\n');
    process.exit(code);
}


// Create a temporary server which simply returns 500 to all requests
function createBootstrapServer(port, cb) {
    var bootstrapServer = restify.createServer();
    bootstrapServer.use(restify.fullResponse());

    function bootstrapHandler(req, res, next) {
        res.send(new restify.InternalError('Failure to connect to Moray'));

        if (next) {
            next();
        }
    }

    ['get', 'post', 'put', 'del', 'head'].forEach(function (method) {
        bootstrapServer[method]('/.*/', bootstrapHandler);
    });

    bootstrapServer.on('MethodNotAllowed', bootstrapHandler);

    bootstrapServer.listen(port, function () {
        cb(null, bootstrapServer);
    });
}


function run() {
    LOG = bunyan.createLogger({
        level: (PARSED.debug ? 'trace' : 'info'),
        name: 'cloudapi',
        stream: process.stderr,
        serializers: restify.bunyan.serializers
    });

    var config = mod_config.configure({
        configFilePath: PARSED.file,
        overrides: PARSED,
        log: LOG
    });

    setupLogger(config);
    config.log = LOG;

    // We create a temporary server which will reply to all requests with 503
    // until the proper cloudapi server can begin listening. We have the
    // boostrap since it may not be possible for the proper server to being
    // listening due to dependencies not being available (e.g. Moray is
    // offline, so plugin configs cannot be loaded)

    createBootstrapServer(config.port, function (err, bootstrapServer) {
        if (err) {
            throw err;
        }

        LOG.info('bootstrap listening at %s', bootstrapServer.url);

        app.createServer(config, function (err2, server) {
            if (err2) {
                throw err2;
            }

            // close bootstrap...
            bootstrapServer.close();
            LOG.info('bootstrap shut down');

            // and listen() on proper server
            server.start(function () {
                LOG.info('cloudapi listening at %s', server.url);
            });

            return server;
        });
    });
}



// --- Mainline

PARSED = nopt(opts, shortOpts, process.argv, 2);
if (PARSED.help) {
    usage(0);
}

// There we go!:
run();
var util = require('util');
