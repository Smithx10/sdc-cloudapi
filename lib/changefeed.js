/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Bruce, Inc.
 */

/*
 * Exposes the internal change feed
 */
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var assert = require('assert-plus');
var libuuid = require('libuuid');
var Watershed = require('watershed').Watershed;
var changefeed = require('changefeed');
var translate = require('./machines.js').translate;
var shed = new Watershed();
var bunyan = require('bunyan');
var cloudapicfg = __dirname + '/../etc/cloudapi.cfg';
var config = JSON.parse(fs.readFileSync(cloudapicfg, 'utf8'));

// Error Handling Functions
function invalidSubResource(subResource, resource) {
    var returnString =
        subResource +
        ' is not a valid changefeed subResource for the ' +
        resource +
        ' resource';
    return returnString;
}
function invalidResource(resource) {
    return resource + ' is not a valid changefeed resource';
}

// Create this into a sub logger in the future
var log = bunyan.createLogger({
    name: 'changefeed',
    level: 'info',
    stream: process.stdout
});

function Feed() {
    var self = this;
    self.log = log;
    self.events = new EventEmitter();
    self.wss = {};

    // Start streaming in events from VMAPI
    self.vmapiFeed = changefeed.createListener({
        backoff: {
            maxTimeout: Infinity,
            minTimeout: 10,
            retries: Infinity
        },
        log: self.log,
        url: config.vmapi.url,
        port: 80,
        instance: config.instanceUuid,
        service: config.serviceName,
        changeKind: {
            resource: 'vm',
            subResources: [
                'alias',
                'customer_metadata',
                'destroyed',
                'nics',
                'owner_uuid',
                'server_uuid',
                'state',
                'tags'
            ]
        }
    });

    self.vmapiFeed.register();

    self.vmapiFeed.on('readable', function () {
        var changeItem = self.vmapiFeed.read();
        self.events.emit('vm', changeItem);
    });
}

// Handle Get Requests
Feed.prototype.get = function get(req, res, next) {
    var self = this;

    // Handle Incoming Upgrade Requests
    if (!res.claimUpgrade) {
        return next(new Error('Connection Must Upgrade For WebSockets'));
    }

    var upgrade = res.claimUpgrade();
    var ws = shed.accept(req, upgrade.socket, upgrade.head);

    ws.once('text', function (msg) {
        // Parse the incoming response, and then validate it.
        try {
            var changeKind = JSON.parse(msg);
        } catch (e) {
            log.warn({ changeKind: changeKind},
                'Invalid changeKind registration: %s',
                e);
            ws.end('womp', e);
            return;
        }

        assertChangeKind(changeKind, function (err) {
            if (err !== null) {
                ws.end(err);
                return;
            }
        });

        var uuid = libuuid.create();
        // Pop the websocket onto a object so we can clean it up later
        self.wss[uuid] = ws;

        ws.on('end', function () {
            if (self.wss[uuid] !== undefined) {
                self.wss[uuid].end();
                delete self.wss[uuid];
            }
        });

        ws.on('connectionReset', function () {
            if (self.wss[uuid] !== undefined) {
                self.wss[uuid].end();
                delete self.wss[uuid];
            }
        });

        self.events.on(changeKind.resource, function (changeItem) {
            var matches = [];
            changeItem.changeKind.subResources.forEach(function (e1) {
                changeKind.subResources.forEach(function (e2) {
                    if (e1 === e2) {
                        matches.push(e1);
                    }
                });
            });
            if (matches.length > 0) {
                if (changeItem.changeKind.resourceObject.owner_uuid ===
                    req.account.uuid) {
                    switch (changeKind.resource) {
                        case 'vm':
                            var wsMsg = JSON.parse(JSON.stringify(changeItem));
                            wsMsg.changeKind.resourceObject = translate(
                                wsMsg.changeKind.resourceObject, req);
                            // translateState in translate in machines.js
                            // changes the down, and stopped states to stopped.
                            // if we don't override with the original we get
                            // false positives. Perhaps cloudapi's
                            // translateStates should match events produced.
                            wsMsg.changeKind.resourceObject.state =
                                changeItem.changeKind.resourceObject.state;
                            if (typeof (self.wss[uuid]) !== 'undefined') {
                                var jsonMsg = JSON.stringify(wsMsg);
                                self.wss[uuid].send(jsonMsg);
                            }
                            break;
                        default:
                            break;
                    }
                }
            }
        });
    });
    return next();
};

Feed.prototype.Subscriber = function Subscriber() {};

var feed = new Feed();

var VALID_RESOURCES = ['vm', 'nic', 'network'];

var VALID_VM_RESOURCES = [
    'alias',
    'customer_metadata',
    'destroyed',
    'nics',
    'owner_uuid',
    'server_uuid',
    'state',
    'tags'
];
var VALID_NETWORK_RESOURCES = [
    'create',
    'delete',
    'gateway',
    'resolvers',
    'routes'
];
var VALID_NIC_RESOURCES = [
    'create',
    'delete',
    'allow_dhcp_spoofing',
    'allow_ip_spoofing',
    'allow_mac_spoofing',
    'primary',
    'state'
];

function assertChangeKind(changeKind, callback) {
    assert.object(changeKind, 'changeKind');
    assert.string(changeKind.resource, 'changeKind.resource');
    assert.array(changeKind.subResources, 'changeKind.subResources');

    if (VALID_RESOURCES.indexOf(changeKind.resource) === -1) {
        return callback(invalidResource(changeKind.resource));
    }

    if (changeKind.resource === 'vm') {
        changeKind.subResources.forEach(function (subResource) {
            if (VALID_VM_RESOURCES.indexOf(subResource) === -1) {
                var err = invalidSubResource(subResource, changeKind.resource);
                return callback(err);
            }
        return callback(null);
        });
    }

    if (changeKind.resource === 'nic') {
        changeKind.subResources.forEach(function (subResource) {
            if (VALID_NIC_RESOURCES.indexOf(subResource) === -1) {
                var err = invalidSubResource(subResource, changeKind.resource);
                return callback(err);
            }
        return callback(null);
        });
    }

    if (changeKind.resource === 'network') {
        changeKind.subResources.forEach(function (subResource) {
            if (VALID_NETWORK_RESOURCES.indexOf(subResource) === -1) {
                var err = invalidSubResource(subResource, changeKind.resource);
                return callback(err);
            }
        return callback(null);
        });
    }

    callback(null);
    return null;
}

function mount(server, before) {
    assert.object(server);
    assert.ok(before);

    server.get(
        {
            path: '/:account/changefeed',
            name: 'changefeed'
        },
        before,
        feed.get.bind(feed));

    return server;
}

// --- Exports
module.exports = {
    mount: mount
};
