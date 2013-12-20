// Copyright 2013 Joyent, Inc. All rights reserved.

var fs = require('fs');
var util = require('util');
var test = require('tap').test;
var libuuid = require('libuuid');
function uuid() {
    return (libuuid.create());
}
var sprintf = util.format;
var common = require('./common');
var machinesCommon = require('./machines/common');
var checkMachine = machinesCommon.checkMachine;
var checkJob = machinesCommon.checkJob;
var waitForJob = machinesCommon.waitForJob;
var checkWfJob = machinesCommon.checkWfJob;
var waitForWfJob = machinesCommon.waitForWfJob;
var saveKey = machinesCommon.saveKey;
var addPackage = machinesCommon.addPackage;

// --- Globals

var client, server, snapshot;
var keyName = uuid();
var machine;
var image_uuid;
var KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAIEAvad19ePSDckmgmo6Unqmd8' +
    'n2G7o1794VN3FazVhV09yooXIuUhA+7OmT7ChiHueayxSubgL2MrO/HvvF/GGVUs/t3e0u4' +
    '5YwRC51EVhyDuqthVJWjKrYxgDMbHru8fc1oV51l0bKdmvmJWbA/VyeJvstoX+eiSGT3Jge' +
    'egSMVtc= mark@foo.local';

var TAG_KEY = 'role';
var TAG_VAL = 'unitTest';

var META_KEY = 'foo';
var META_VAL = 'bar';

var META_64_KEY = 'sixtyfour';
var META_64_VAL = new Buffer('Hello World').toString('base64');

var META_CREDS = {
    'root': 'secret',
    'admin': 'secret'
};

var META_CREDS_TWO = {
    'root': 'secret',
    'admin': 'secret',
    'jill': 'secret'
};

var TAP_CONF = {
    timeout: 'Infinity '
};


// May or not be created by previous test run or whatever else:
var sdc_256_inactive = {
    name: 'sdc_256_inactive',
    version: '1.0.0',
    max_physical_memory: 256,
    quota: 10240,
    max_swap: 512,
    cpu_cap: 150,
    max_lwps: 1000,
    zfs_io_priority: 10,
    'default': false,
    vcpus: 1,
    urn: 'sdc:' + uuid() + ':sdc_256_inactive:1.0.0',
    active: false
};

var sdc_128_ok = {
    name: 'sdc_128_ok',
    version: '1.0.0',
    max_physical_memory: 128,
    quota: 10240,
    max_swap: 512,
    cpu_cap: 150,
    max_lwps: 1000,
    zfs_io_priority: 10,
    fss: 25,
    'default': false,
    vcpus: 1,
    urn: 'sdc:' + uuid() + ':sdc_128_ok:1.0.0',
    active: true
};


var sdc_256_entry, sdc_256_inactive_entry, sdc_128_ok_entry;

var HEADNODE = null;

var CREATE_IMAGES = false;

// --- Tests

test('setup', TAP_CONF, function (t) {
    common.setup(function (err, _client, _server) {
        t.ifError(err, 'common setup error');
        t.ok(_client, 'common _client ok');
        client = _client;
        if (!process.env.SDC_SETUP_TESTS) {
            t.ok(_server);
        }
        server = _server;
        var cfg = common.getCfg();
        if (cfg.bleeding_edge_features &&
            cfg.bleeding_edge_features.img_mgmt &&
            cfg.bleeding_edge_login_whitelist &&
            cfg.bleeding_edge_login_whitelist['*']) {
            CREATE_IMAGES = true;
        }
        saveKey(KEY, keyName, client, t, function () {
            // Add custom packages; "sdc_" ones will be owned by admin user:
            addPackage(client, sdc_128_ok, function (err2, entry) {
                t.ifError(err2, 'Add package error');
                sdc_128_ok_entry = entry;
                addPackage(client, sdc_256_inactive, function (err3, entry2) {
                    t.ifError(err3, 'Add package error');
                    sdc_256_inactive_entry = entry2;
                    t.end();
                });
            });
        });
    });
});


test('ListMachines (empty)', TAP_CONF, function (t) {
    client.get('/my/machines', function (err, req, res, body) {
        t.ifError(err, 'GET /my/machines error');
        t.equal(res.statusCode, 200, 'GET /my/machines Status');
        common.checkHeaders(t, res.headers);
        t.ok(body, 'GET /my/machines body');
        t.ok(Array.isArray(body), 'body is an array');
        t.ok(!body.length, 'body array is empty');
        t.end();
    });
});


test('Get Headnode', TAP_CONF, function (t) {
    client.cnapi.listServers(function (err, servers) {
        t.ifError(err);
        t.ok(servers);
        t.ok(Array.isArray(servers));
        t.ok(servers.length > 0);
        servers = servers.filter(function (s) {
            return (s.headnode);
        });
        t.ok(servers.length > 0);
        HEADNODE = servers[0];
        t.ok(HEADNODE);
        t.end();
    });
});


test('Create machine with inactive package', TAP_CONF, function (t) {
    var obj = {
        dataset: 'smartos',
        'package': sdc_256_inactive_entry.name,
        name: 'a' + uuid().substr(0, 7),
        server_uuid: HEADNODE.uuid
    };

    client.post({
        path: '/my/machines',
        headers: {
            'accept-version': '~6.5'
        }
    }, obj, function (err, req, res, body) {
        t.ok(err, 'POST /my/machines with inactive package error');
        var cfg = common.getCfg();
        var capi_limits = cfg.plugins.filter(function (p) {
            return (p.name === 'capi_limits');
        })[0];
        if (capi_limits.enabled) {
            t.equal(res.statusCode, 403);
        } else {
            t.equal(res.statusCode, 409);
        }
        t.end();
    });
});

var DATASET;

test('get smartos dataset', TAP_CONF, function (t) {
    client.get('/my/datasets?name=smartos', function (err, req, res, body) {
        t.ifError(err, 'GET /my/datasets error');
        t.equal(res.statusCode, 200, 'GET /my/datasets status');
        common.checkHeaders(t, res.headers);
        t.ok(body, 'GET /my/datasets body');
        t.ok(Array.isArray(body), 'GET /my/datasets body is an array');
        t.ok(body.length, 'GET /my/datasets body array has elements');
        body.forEach(function (d) {
            if (d.version && d.version === '1.6.3') {
                DATASET = body[0].id;
            }
        });
        t.end();
    });
});


// Test using IMAGE.uuid instead of IMAGE.name due to PUBAPI-625:
test('CreateMachine', TAP_CONF, function (t) {
    var obj = {
        image: DATASET,
        'package': 'sdc_128_ok',
        name: 'a' + uuid().substr(0, 7),
        server_uuid: HEADNODE.uuid,
        firewall_enabled: true
    };
    obj['metadata.' + META_KEY] = META_VAL;
    obj['metadata.' + META_64_KEY] = META_64_VAL;
    obj['tag.' + TAG_KEY] = TAG_VAL;

    obj['metadata.credentials'] = META_CREDS;

    client.post('/my/machines', obj, function (err, req, res, body) {
        t.ifError(err, 'POST /my/machines error');
        t.equal(res.statusCode, 201, 'POST /my/machines status');
        common.checkHeaders(t, res.headers);
        t.equal(res.headers.location,
            util.format('/%s/machines/%s', client.testUser, body.id));
        t.ok(body, 'POST /my/machines body');
        checkMachine(t, body);
        machine = body.id;
        // Handy to output this to stdout in order to poke around COAL:
        console.log('Requested provision of machine: %s', machine);
        t.end();
    });
});


test('Wait For Running', TAP_CONF,  function (t) {
    client.vmapi.listJobs({
        vm_uuid: machine,
        task: 'provision'
    }, function (err, jobs) {
        if (err) {
            // Skip machine tests when machine creation fails
            machine = null;
        }
        t.ifError(err, 'list jobs error');
        t.ok(jobs, 'list jobs ok');
        t.ok(jobs.length, 'list jobs is an array');
        waitForJob(client, jobs[0].uuid, function (err2) {
            if (err2) {
                // Skip machine tests when machine creation fails
                machine = null;
            }
            t.ifError(err2, 'Check state error');
            t.end();
        });
    });
});


test('ListMachines all', TAP_CONF, function (t) {
    if (machine) {
        client.get('/my/machines', function (err, req, res, body) {
            t.ifError(err, 'GET /my/machines error');
            t.equal(res.statusCode, 200, 'GET /my/machines status');
            common.checkHeaders(t, res.headers);
            t.ok(body, 'GET /my/machines body');
            t.ok(Array.isArray(body), 'GET /my/machines body is array');
            t.ok(body.length, 'GET /my/machines list is not empty');
            body.forEach(function (m) {
                checkMachine(t, m);
            });
            t.end();
        });
    } else {
        t.end();
    }
});


// Fixed by PUBAPI-774, again!
test('ListMachines (filter by dataset)', TAP_CONF, function (t) {
    if (machine) {
        client.get('/my/machines?image=' + DATASET,
            function (err, req, res, body) {
            t.ifError(err, 'GET /my/machines by dataset error');
            t.equal(res.statusCode, 200, 'GET /my/machines by dataset status');
            common.checkHeaders(t, res.headers);
            t.ok(body, 'GET /my/machines by dataset body');
            t.ok(Array.isArray(body),
                'GET /my/machines by dataset body is array');
            t.ok(body.length, 'GET /my/machines by dataset list is not empty');
            body.forEach(function (m) {
                checkMachine(t, m);
            });
            t.end();
        });
    } else {
        t.end();
    }
});


test('Get Machine Include Credentials', TAP_CONF, function (t) {
    if (machine) {
        var url = '/my/machines/' + machine + '?credentials=true';
        client.get(url, function (err, req, res, body) {
            t.ifError(err, 'GET /my/machines/:id error');
            t.equal(res.statusCode, 200, 'GET /my/machines/:id status');
            common.checkHeaders(t, res.headers);
            t.ok(body, 'GET /my/machines/:id body');
            checkMachine(t, body);
            t.equal(typeof (body.metadata.credentials), 'object');
            Object.keys(META_CREDS).forEach(function (k) {
                t.equal(body.metadata.credentials[k], META_CREDS[k]);
            });
            t.end();
        });
    } else {
        t.end();
    }
});


test('Stop test', TAP_CONF, function (t) {
    var stopTest = require('./machines/stop');
    stopTest(t, client, machine, function () {
        t.end();
    });
});


test('Start test', TAP_CONF, function (t) {
    var startTest = require('./machines/start');
    startTest(t, client, machine, function () {
        t.end();
    });
});


test('Reboot test', TAP_CONF, function (t) {
    var rebootTest = require('./machines/reboot');
    rebootTest(t, client, machine, function () {
        t.end();
    });
});


test('Resize machine to inactive package', TAP_CONF, function (t) {
    client.post('/my/machines/' + machine, {
        action: 'resize',
        'package': sdc_256_inactive_entry.name
    }, function (err, req, res, body) {
        t.ok(err, 'Resize to inactive package error');
        t.equal(res.statusCode, 409, 'Resize to inactive pkg status');
        t.end();
    });
});


test('Resize machine tests', TAP_CONF, function (t) {
    var resizeTest = require('./machines/resize');
    resizeTest(t, client, machine, sdc_128_ok_entry, function () {
        t.end();
    });
});


test('Tags tests', TAP_CONF, function (t) {
    var testTags = require('./machines/tags');
    testTags(t, client, machine, function () {
        t.end();
    });
});


test('Metadata tests', TAP_CONF, function (t) {
    var testMetadata = require('./machines/metadata');
    testMetadata(t, client, machine, function () {
        t.end();
    });
});


test('Snapshots tests', TAP_CONF, function (t) {
    var testSnapshots = require('./machines/snapshots');
    testSnapshots(t, client, machine, function () {
        t.end();
    });
});


test('Firewall Rules tests', TAP_CONF, function (t) {
    var testFirewallRules = require('./machines/firewall-rules');
    testFirewallRules(t, client, machine, function () {
        t.end();
    });
});



test('Delete tests', TAP_CONF, function (t) {
    var deleteTest = require('./machines/delete');
    deleteTest(t, client, machine, function () {
        t.end();
    });
});


test('machine audit', TAP_CONF, function (t) {
    var p = '/my/machines/' + machine + '/audit';
    client.get(p, function (err, req, res, body) {
        t.ifError(err);
        t.ok(Array.isArray(body));
        t.ok(body.length);
        var f = body.reverse()[0];
        t.ok(f.success);
        t.ok(f.time);
        t.ok(f.action);
        t.ok(f.caller);
        t.ok(f.caller.type);
        t.equal(f.caller.type, 'signature');
        t.ok(f.caller.ip);
        t.ok(f.caller.keyId);
        t.end();
    });
});


test('ListMachines tombstone', TAP_CONF, function (t) {
    client.get('/my/machines?tombstone=20', function (err, req, res, body) {
        t.ifError(err, 'GET /my/machines error');
        t.equal(res.statusCode, 200, 'GET /my/machines status');
        common.checkHeaders(t, res.headers);
        t.ok(body, 'GET /my/machines body');
        t.ok(Array.isArray(body), 'GET /my/machines body is array');
        t.ok(body.length, 'GET /my/machines list is not empty');
        t.ok(body.some(function (m) {
            return (m.id === machine);
        }));
        t.end();
    });
});


test('ListMachines exclude tombstone', TAP_CONF, function (t) {
    client.get('/my/machines', function (err, req, res, body) {
        t.ifError(err, 'GET /my/machines error');
        t.equal(res.statusCode, 200, 'GET /my/machines status');
        common.checkHeaders(t, res.headers);
        t.ok(body, 'GET /my/machines body');
        t.ok(Array.isArray(body), 'GET /my/machines body is array');
        t.notOk(body.some(function (m) {
            return (m.id === machine);
        }));
        t.end();
    });
});


test('teardown', {timeout: 'Infinity '}, function (t) {
    client.del('/my/keys/' + keyName, function (err, req, res) {
        t.ifError(err, 'delete key error');
        t.equal(res.statusCode, 204);
        common.checkHeaders(t, res.headers);
        client.teardown(function (err2) {
            // Ignore err2 here, just means we have not been able to remove
            // something from ufds.
            if (!process.env.SDC_SETUP_TESTS) {
                Object.keys(server._clients).forEach(function (c) {
                    if (typeof (server._clients[c].client) !== 'undefined' &&
                        typeof (server._clients[c].client.close) ===
                            'function') {
                        server._clients[c].client.close();
                        }
                });
                server._clients.ufds.client.removeAllListeners('close');
                server.close(function () {
                    t.end();
                });
            } else {
                t.end();
            }
        });
    });
});
