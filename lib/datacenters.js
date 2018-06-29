/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Datacenters are defined using CloudAPI configuration file. The routes
 * defined here just return a list or one of them.
 *
 * Additionally, this file also defines the "not yet documented"
 * ListForeignDatacenters and AddForeignDatacenter routes. We still need to
 * make a decission on those.
 */

var assert = require('assert-plus');
var util = require('util');

var restify = require('restify');

var resources = require('./resources');

// --- Globals

var MSG_302 = '';
var MSG_404 = '%s is not an available datacenter';
var ResourceNotFoundError = restify.ResourceNotFoundError;
var sprintf = util.format;



// --- Functions

function list(req, res, next) {
    assert.ok(req.config);
    if (req.accountMgmt) {
        resources.getRoleTags(req, res);
    }
    var log = req.log,
        datacenters = req.config.datacenters || {};

    // Include a header to show the current datacenter name.
    if (req.config.datacenter_name) {
        res.header('Triton-Datacenter-Name', req.config.datacenter_name);
    }

    log.debug('listDatacenters(%s) => %j', req.params.account, datacenters);
    res.send(datacenters);

    return next();
}


function get(req, res, next) {
    assert.ok(req.config);

    var datacenters = req.config.datacenters || {},
        dc = req.params.dc,
        log = req.log,
        body;

    if (!datacenters[dc]) {
        return next(new ResourceNotFoundError(MSG_404, dc));
    }

    body = {
        code: 'ResourceMoved',
        message: sprintf(MSG_302, dc, datacenters[dc])
    };

    if (req.accountMgmt) {
        resources.getRoleTags(req, res);
    }

    res.header('Location', datacenters[dc]);

    log.debug('getDatacenter(%s) => %j', dc, body);
    res.send(302, body);
    return next();
}

function listforeign(req, res, next) {
    assert.ok(req.config);
    if (!req.authorization.signature || !req.header('X-Auth-Token')) {
        var message =
            'method requires HTTP signature auth token delegated authorization';
        res.send(403, {'code': 'Forbidden',
            'message': message});
        return next();
    }
    var dev = req.authorization.signature.keyId.split('/')[1];
    return req.sdc.ufds.listForeigndc(req.caller, dev, function (err, dclist) {
        if (err) {
            req.log.error(err, 'unexpected error');
            res.send(500, {code: 'InternalServerError',
                message: 'Internal Error'});
        } else {
            res.send(200, dclist);
        }
        next();
    });
}

function addforeign(req, res, next) {
    assert.ok(req.config);

    if (!req.authorization.signature || !req.header('X-Auth-Token')) {
        var message =
            'method requires HTTP signature auth token delegated authorization';
        res.send(403, {'code': 'Forbidden',
            'message': message});
        return next();
    }
    var dev = req.authorization.signature.keyId.split('/')[1];
    var dc = req.params;
    return req.sdc.ufds.addForeigndc(req.caller, dev, dc,
            function (err, dclist) {
        if (err) {
            req.log.error(err, 'unexpected error');
            res.send(500,
                {code: 'InternalServerError', message: 'Internal Error'});
        } else {
            res.send(200, dclist);
        }
        next();
    });
}

function mount(server, before) {
    assert.object(server);
    assert.ok(before);

    server.get({
        path: '/:account/datacenters',
        name: 'ListDatacenters'
    }, before, list);

    server.get({
        path: '/:account/datacenters/:dc',
        name: 'GetDatacenter'
    }, before, get);

    server.get({
        path: '/:account/foreigndatacenters',
        name: 'ListForeignDatacenters'
    }, before, listforeign);

    server.post({
        path: '/:account/foreigndatacenters',
        name: 'AddForeignDatacenter'
    }, before, addforeign);

    return server;
}



// --- API

module.exports = {
    mount: mount
};
