/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * Endpoints for managing account configuration
 */

var assert = require('assert-plus');
var jsprim = require('jsprim');
var restify = require('restify');
var schemas = require('joyent-schemas').cloudapi;
var util = require('util');


// --- Helpers



/**
 * Translate a UFDS error into a cloudapi-friendly error
 */
function translateErr(err) {
    if (err.name === 'ResourceNotFoundError') {
        return new restify.ServiceUnavailableError(
            'Error getting config');
    }

    return err;
}


/**
 * Translate the UFDS representation of a default network into a
 * cloudapi-friendly format
 */
function translateUfdsConf(conf) {
    return {
        default_network: conf.defaultnetwork
    };
}


/**
 * Validate request parameters and transform them into their UFDS format
 */
function validateAndTranslate(inParams) {
    var err;
    var params = jsprim.deepCopy(inParams);
    delete params.account;

    err = jsprim.validateJsonObject(schemas.UpdateConfig, params);
    if (err) {
        if (err.message.match(/does not match the regex pattern/)) {
            throw new restify.InvalidArgumentError(err,
                    util.format('property "%s": must be a UUID',
                    err.jsv_details.property));
        }

        throw new restify.InvalidArgumentError(err, err.message);
    }

    // Translate config object to its format in UFDS:
    params.defaultnetwork = params.default_network;
    delete params.default_network;

    return params;
}



// --- Restify handlers



function getConfig(req, res, next) {
    getConfigFromUFDS(req, function _afterGetFromUFDS(err, conf) {
        if (err) {
            return next(err);
        }

        res.send(conf);
        return next();
    });
}


function updateConfig(req, res, next) {
    var account = req.account.uuid;
    var dc = req.config.datacenter_name;
    var netUuids = req.networks.map(function (n) { return n.uuid; });
    var params;

    try {
        params = validateAndTranslate(req.params);
    } catch (vErr) {
        return next(vErr);
    }

    if (netUuids.indexOf(params.defaultnetwork) === -1) {
        return next(new restify.InvalidArgumentError('unknown network'));
    }

    return req.sdc.ufds.updateDcLocalConfig(account, dc, params,
            function _afterConfUpdate(err, conf) {
        if (err) {
            /*
             * If the dclocalconfig is missing, it's most likely due to a
             * race with napi-ufds-watcher. The watcher usually takes several
             * seconds after the creation of a user to create dclocalconfig.
             */
            if (err.name === 'MissingParameterError' &&
                err.message.match('dclocalconfig')) {
                return next(new restify.InternalError(
                    'Config currently unavailable.'));
            } else {
                return next(translateErr(err));
            }
        }

        res.send(translateUfdsConf(conf));
        return next();
    });
}



///--- API


function getConfigFromUFDS(req, callback) {
    var account = req.account.uuid;
    var dc = req.config.datacenter_name;

    req.log.debug({ account: account, dc: dc }, 'Getting user config');

    req.sdc.ufds.getDcLocalConfig(account, dc,
            function _afterConfGet(err, conf) {
        if (err) {
            if (err.name !== 'ResourceNotFoundError') {
                return callback(translateErr(err));
            }

            conf = {}; // treat an empty object as default
        }

        req.log.debug({ account: account, dc: dc, config: conf },
            'Got user config');
        return callback(null, translateUfdsConf(conf));
    }, true); // disable caching
    /*
     * Fetching the config is an uncommon operation, and caching the value
     * causes inconsistencies since cloudapi usually operates with multiple
     * processes (thus multiple caches, where invalidations and updates in one
     * process don't occur in the others). Disabling caching ensures that
     * clients get a consistent view, and prevents problems in other parts of
     * cloudapi's code that uses values in the config.
     */
}


function mountConfig(server, before) {
    assert.object(server);
    assert.ok(before);

    var path = '/:account/config';

    server.get({
        path: path,
        name: 'GetConfig'
    }, before, getConfig);

    server.head({
        path: path,
        name: 'HeadConfig'
    }, before, getConfig);

    server.put({
        path: path,
        name: 'UpdateConfig'
    }, before, updateConfig);

    return server;
}



module.exports = {
    get: getConfigFromUFDS,
    mount: mountConfig
};
