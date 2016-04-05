---
title: Joyent CloudAPI Administrator's Guide
mediaroot: ./media
apisections:
markdown2extras: tables, code-friendly, cuddled-lists
---
<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# Overview

CloudAPI is the customer-facing API that supports the Customer Portal, as well
as direct API requests from customers using either the SmartDataCenter CLI or
custom tooling.  CloudAPI is a REST service written in node.js, and runs on the
head node.  This document describes configuration and troubleshooting for the
CloudAPI service.

## Customer Documentation

For the end-user documentation, please visit [CloudAPI documentation](./index.html).

# Layout

CloudAPI is installed in its own zone on the head node.  The name of the zone
is `cloudapi`.  Within the cloudapi zone, the relevant software is installed
under `/opt/smartdc/cloudapi`. CloudAPI is installed as an SMF service, so
log output is placed in:
`/var/svc/log/smartdc-application-cloudapi:default.log`.
The CloudAPI configuration file lives at
`/opt/smartdc/cloudapi/etc/cloudapi.cfg`.


# SAPI Configuration

Some aspects of cloudapi are configured via the "metadata" on the "cloudapi"
service (of the "sdc" application) in SAPI. This is a list of those knobs.

| Metadata Key                                  | Type    | Description                                      |
| --------------------------------------------- | ------- | ------------------------------------------------ |
| **CLOUDAPI_READONLY**                         | Boolean | Default false. Used to put cloudapi into read-only mode for DC maintenance. |
| **CLOUDAPI_DATACENTERS**                      | String  | The response for the 'ListDatacenters' endpoint. |
| **CLOUDAPI_SERVICES**                         | String  | The response for the 'ListServices' endpoint. See discussion below. |
| **CLOUDAPI_PLUGINS**                          | Array   | See "Plugins" section below.                     |
| **CLOUDAPI_BLEEDING_EDGE_FEATURES**           | Array   | See "Bleeding Edge Features" section below.      |
| **CLOUDAPI_BLEEDING_EDGE_LOGIN_WHITELIST**    | Array   | See "Bleeding Edge Features" section below.      |
| **CLOUDAPI_THROTTLE_WHITELIST**               | Array   | See "Throttles" section below.                   |
| **CLOUDAPI_MULTIPLE_PUB_NETWORKS**            | Boolean | Default false. Whether machines can be provisioned with more than one public network. |
| **CLOUDAPI_TEST_MODE**                        | Boolean | Default false. Disable some security checks to make testing easier. |
| **CLOUDAPI_IGNORE_APPROVED_FOR_PROVISIONING** | Boolean | Default false. Allow provisioning for users even if they have not been given permission. |

For example, the 'docker' service could be added to CLOUDAPI_SERVICES as
follows.

    docker_endpoint="tcp://docker.coal.joyent.us:2376"
    cloudapi_svc=$(sdc-sapi /services?name=cloudapi | json -H 0.uuid)
    sapiadm get $cloudapi_svc \
        | json -e "
            svcs = JSON.parse(this.metadata.CLOUDAPI_SERVICES || '{}');
            svcs.docker = '$docker_endpoint';
            this.update = {metadata: {CLOUDAPI_SERVICES: JSON.stringify(svcs)}};
            " update \
        | sapiadm update $cloudapi_svc


# Configuration

An example "full" configuration, looks like what's below.  The rest of this
section will explain the configuration file.

    {
        "port": 443,
        "certificate": "/opt/smartdc/cloudapi/ssl/cert.pem",
        "key": "/opt/smartdc/cloudapi/ssl/key.pem",
        "read_only": false,
        "datacenters": {
            "coal": "https://10.88.88.131"
        },
        "ufds": {
            "url": "ldaps://10.99.99.14",
            "bindDN": "cn=root",
            "bindPassword": "XXX",
            "cache": {
                "size": 5000,
                "expiry": 60
            }
        },
        "vmapi": {
            "url": "http://10.99.99.22",
            "cache": {
                "size": 5000,
                "expiry": 60
            }
        },
        "cnapi": {
            "url": "http://10.99.99.18",
            "cache": {
                "size": 1000,
                "expiry": 300
            }
        },
        "napi": {
            "url": "http://10.99.99.10",
            "cache": {
                "size": 5000,
                "expiry": 300
            }
        },
        "fwapi": {
            "url": "http://10.99.99.22",
            "cache": {
                "size": 1000,
                "expiry": 300
            }
        },
        "imgapi": {
            "url": "http://10.99.99.17",
            "cache": {
                "size": 5000,
                "expiry": 300
            }
        },
        "ca": {
            "url": "http://10.99.99.24:23181"
        },
        "plugins": [
            {
                "name": "capi_limits",
                "enabled": false,
                "config": {
                    "datacenter": "coal",
                    "defaults": {
                        "smartos": 1,
                        "nodejs": 1,
                        "ubuntu": 1
                    }
                }
            }, {
                "name": "machine_email",
                "enabled": false,
                "config": {
                    "datacenter": "coal",
                    "smtp": {
                        "host": "127.0.0.1",
                        "port": 25,
                        "use_authentication": false,
                        "user": "",
                        "pass": ""
                    },
                    "from": "nobody@joyent.com",
                    "subject": "Your SmartDataCenter machine is provisioning",
                    "body": "Check /my/machines for updates"
                }
            }
        ],
        "userThrottles": {
            "all": {
                "username": true,
                "burst": 30,
                "rate": 10,
                "overrides": {
                    "admin": {
                        "burst": 0,
                        "rate": 0
                    }
                }
            },
            "analytics": false
        },
        "bleeding_edge_features": {
            "": false
        },
        "bleeding_edge_login_whitelist": {
            "": false
        }
    }


## Top-Level Configuration

    {
        "port": 443,
        "certificate": "/opt/smartdc/cloudapi/ssl/cert.pem",
        "key": "/opt/smartdc/cloudapi/ssl/key.pem",
        "read_only": false,
        "datacenters": {
            "coal": "https://10.88.88.131"
        },
      ...
    }

This portion of the configuration file tells CloudAPI how to start up and what
datacenter this instance is bound to (along with what other datacenters this
instance should redirect to).

| Field | Type | Description |
| ----- | ---- | ----------- |
| port | Number | What SSL port to listen on |
| certificate | String | Path to a PEM encoded SSL certificate; can be relative to /opt/smartdc/cloudapi |
| key | String | Path to a PEM encoded private key for the SSL certificate; can be relative to /opt/smartdc/cloudapi |
| read_only | Boolean | When set to true, the API will deny all the POST/PUT/DELETE requests. Provided for review right after upgrading Smart DataCenter |
| datacenters | Object | a k/v pairing of other DC's to URL's this instance should answer with. |


## Bleeding Edge Features

    ...
        "bleeding_edge_features": {
            "foo": true,
            "": false
        },
        "bleeding_edge_login_whitelist": {
            "admin": true,
            "": false
        }
    ...

One can define bleeding edge features by name and then set a whitelist of user
login's allowed to access those features. Cloudapi code before PUBAPI-816 shows
how to uses this config to guard endpoints and certain functionality. Currently
the "metadata.BLEEDING_EDGE_FEATURES" and
"metadata.BLEEDING_EDGE_LOGIN_WHITELIST" arrays on the "cloudapi" SAPI service
set the features and whitelist.


## UFDS

        "ufds": {
            "url": "ldaps://10.99.99.14",
            "bindDN": "cn=root",
            "bindPassword": "XXX",
            "cache": {
                "size": 5000,
                "expiry": 60
            }
        },

The `ufds` config block tells CloudAPI how to communicate with UFDS, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where UFDS lives |
| bindDN | String | The DN to bind to UFDS LDAP server with. |
| bindPassword | String | The password to bind to UFDS LDAP server with |
| cache | Object | Controls the UFDS client cache size and the time to expire it |

## VMAPI

        "vmapi": {
            "url": "http://10.99.99.22",
            "cache": {
                "size": 5000,
                "expiry": 60
            }
        },

The `vmapi` config block tells CloudAPI how to communicate with VMAPI, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where VMAPI lives |
| cache | Object | Controls the VMAPI client cache size and the time to expire it, (in seconds) |

## WFAPI

        "wfapi": {
            "url": "WFAPI_URL",
            "cache": {
                "size": 1000,
                "expiry": 300
            }
        },

The `wfapi` config block tells CloudAPI how to communicate with Workflow API, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where WFAPI lives |
| cache | Object | Controls the WFAPI client cache size and the time to expire it, (in seconds) |

## CNAPI

        "cnapi": {
            "url": "http://10.99.99.18",
            "cache": {
                "size": 5000,
                "expiry": 300
            }
        },


The `cnapi` config block tells CloudAPI how to communicate with CNAPI, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where CNAPI lives |
| cache | Object | Controls the CNAPI client cache size and the time to expire it, (in seconds) |


## CA

      "ca": {
        "url": "http://10.99.99.24:23181"
      },

The `ca` config block tells CloudAPI how to communicate with Cloud Analytics, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where CA lives |

## NAPI

        "napi": {
            "url": "http://10.99.99.10",
            "cache": {
                "size": 5000,
                "expiry": 300
            }
        },


The `napi` config block tells CloudAPI how to communicate with NAPI, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where NAPI lives |
| cache | Object | Controls the NAPI client cache size and the time to expire it, (in seconds) |


## FWAPI

        "fwapi": {
            "url": "http://10.99.99.22",
            "cache": {
                "size": 5000,
                "expiry": 300
            }
        },


The `fwapi` config block tells CloudAPI how to communicate with FWAPI, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where FWAPI lives |
| cache | Object | Controls the FWAPI client cache size and the time to expire it, (in seconds) |


## IMGAPI

        "imgapi": {
            "url": "http://10.99.99.17",
            "cache": {
                "size": 5000,
                "expiry": 300
            }
        },

The `imgapi` config block tells CloudAPI how to communicate with IMGAPI, and what
cache settings to use.

| Field | Type | Description |
| ----- | ---- | ----------- |
| url | URL | The fully-qualified URL where IMGAPI lives |
| cache | Object | Controls the IMGAPI client cache size and the time to expire it, (in seconds) |



## Plugins

        "plugins": [
            {
                "name": "capi_limits",
                "enabled": false,
                "config": {
                    "datacenter": "coal",
                    "defaults": {
                        "smartos": 1,
                        "nodejs": 1,
                        "ubuntu": 1
                    }
                }
            }, {
                "name": "machine_email",
                "enabled": false,
                "config": {
                    "datacenter": "coal",
                    "smtp": {
                        "host": "127.0.0.1",
                        "port": 25,
                        "use_authentication": false,
                        "user": "",
                        "pass": ""
                    },
                    "from": "nobody@joyent.com",
                    "subject": "Your SmartDataCenter machine is provisioning",
                    "body": "Check /my/machines for updates"
                }
            }
        ],



The `plugins` section is present so that CloudAPI can perform custom
actions **before** and **after** provisioning happens in your environment.  The
different `plugins` can define either `preProvision` hooks, `postProvision`
hooks or both. These plugins are dynamically loaded by CloudAPI at
startup time.  For information on writing a plugin, see
[Provisioning Plugins](#provisioning-plugins).  By default, CloudAPI ships with
some example plugins to limit provisioning based into number of customer
machines, RAM used by customer machines, ...

| Field | Type | Description |
| ----- | ---- | ----------- |
| name | String | Name of the plugin. Assumption is that the .js file containing the plugin is at `/opt/smartdc/cloudapi/plugins/${name}.js` |
| enabled | Boolean | Whether or not this plugin should be loaded |
| config | Object | A free-form object that gets passed into your plugin at creation time |

## Throttles

CloudAPI ships with a completely configurable mechanism for rate limiting
requests from tenants.  You can throttle by IP address and by username (the
former running before authentication, the latter after).  Since the different
internal services CloudAPI protects have different scaling characteristics,
CloudAPI supports throttling each API 'endpoint' separately.  The general
syntax is explained here, rather than a complete annotation of what's in the
configuration file by default.

CloudAPI uses the [Token Bucket](http://en.wikipedia.org/wiki/Token_bucket)
algorithm, and creates a separate bucket for each throttle definition. As an
example:

    "ipThrottles": {
      "all": {
        "ip": true,
        "burst": 9,
        "rate": 3,
        "overrides": {
          "10.99.99.14": {
            "burst": 0,
            "rate": 0
          }
        }
      },
      "analytics": {
        "ip": true,
        "burst": 100,
        "rate": 10,
        "overrides": {
          "10.99.99.14": {
            "burst": 0,
            "rate": 0
          }
        }
      }
    }

This configuration tells CloudAPI to create one token bucket for all endpoints, and make it
match on `ip`.  Allow a maximum burst rate of `9` requests from a single IP
(assuming there are tokens), and refill the bucket at a rate of `3` tokens per
second.  However, allow any requests coming from the portal to have an unlimited
request rate.  Now, in addition to that, because the /analytics endpoint is
likely to get polled at a high velocity (and can support the traffic), we create
a second token bucket specific to the /analytics endpoints. Here, a single IP
can burst to 100, and gets 10 tokens/second.  Again, the portal is allowed
unrestricted access.

The given keys that can be configured in the throttling configuration:

| Key | Description |
| --- | ----------- |
| account | /account specific throttling |
| analytics | /analytics specific throttling |
| keys | /keys specific throttling |
| machines | /machines specific throttling |
| datasets | /datasets specific throttling |
| packages | /packages specific throttling |
| datacenters | /datacenters specific throttling |

These configurations can live in either the `ipThrottles` or `userThrottles`
section (or both).  Note that in `ipThrottles`, the type `ip` is literally
the remote connected address, so if you have placed CloudAPI behind a load
balancer/reverse-proxy, you'll literally be throttling that device, as
opposed to the end user (which probably isn't what you want).  Instead, set
the type to `xff` to throttle on the `X-Forwarded-For` header.

# Provisioning Plugins

In order to facilitate checking a customer for the ability to provision via
arbitrary systems (i.e., your favorite ERP system here), CloudAPI supports a
pre-provisioning "hook" that is invoked before CreateMachine actually calls out
to VMAPI.  Additionally, there is support for a 'post' provisioning plugin, so
that you can send email, or update DNS records.

Assumption is that the .js file containing a plugin with name `${name}`
is at `/opt/smartdc/cloudapi/plugins/${name}.js`.
As described above, there is the ability to define free-form configuration to
your plugin.

For details on writing a plugin, you should be familiar with
[node.js](http://nodejs.org/), [restify](http://mcavage.github.com/node-restify),
and the internal SmartDataCenter APIs.  For a reference plugin, see
`/opt/smartdc/cloudapi/plugins/capi_limits.js` or
`/opt/smartdc/cloudapi/plugins/machine_email.js`.

In order to write a plugin, you need to define a file that at minimum
has what's below (this is the equivalent of the "dummy" hook).

    module.exports = {

      /**
       * Creates a pre-provisioning hook.
       *
       * Config is the JS object that was converted from the
       * free-form config object that is defined in config.json.
       *
       * This function must return a restify filter that is run as part
       * of a restify "pre" chain.
       *
       * @param {Object} config free-form config from config.json.
       * @return {Function} restify 'pre' filter.
       */
      preProvision: function(config) {

        return function(req, res, next) {
          return next();
        };
      };

      /**
       * Creates a post-provisioning hook.
       *
       * Config is the JS object that was converted from the
       * free-form config object that is defined in config.json.
       *
       * This function must return a restify filter that is run as part
       * of a restify "post" chain.
       *
       * @param {Object} config free-form config from config.json.
       * @return {Function} restify 'post' filter.
       */
      postProvision: function(config) {

        return function(req, res, next) {
          return next();
        };
      };

    };

The real handiness comes in on the `req` object; CloudAPI will provide you with
the following handles:

| Handle | Type | Description |
| ------ | ---- | ----------- |
| ufds | Object | An UFDS client; see node\_modules/sdc-clients/lib/ufds.js for more details |
| vmapi | Object | A VMAPI client; see node\_modules/sdc-clients/lib/vmapi.js for more details |
| napi | Object | A NAPI client; see node\_modules/sdc-clients/lib/napi.js for more details |
| imgapi | Object | A IMGAPI client; see node\_modules/sdc-clients/lib/imgapi.js for more details |
| account | Object | A complete JS object of the current requested account's UFDS object |
| dataset | Object | The current dataset that is attempted to be provisioned |
| package | Object | The current package that is attempted to be provisioned |
| log | Object | The restify logger that will let you write into the CloudAPI SMF log |


Additionally, you can require in your plugin file any of the NPM modules
available for CloudAPI itself. See `/opt/smartdc/cloudapi/package.json` for
the complete list of available modules additional to the default NodeJS set.

For more information, inspect the source code of
`/opt/smartdc/cloudapi/plugins/capi_limits.js`.

# Post Provisioning Plugins

In addition to all items available to you in the `preProvision` Hook, there will
additionally be a `res.machine` object, which is the provisioned machine, on the
response.

For more information, inspect the source code of
`/opt/smartdc/cloudapi/plugins/machine_email.js`.


# LogLevels

The logLevel sets the verbosity of debug logging in the SMF log file.  By
default, CloudAPI logs at `info` level, which means you'll get start/stop and
error messages (in addition to request logging).  If you are encountering a
problem with CloudAPI, you'll almost certainly want the level to be set to
`debug` or `trace`.  See [Troubleshooting](#Troubleshooting) below.

# Troubleshooting

If you are seeing errors/bugs with the CloudAPI CLI, or with the reference
portal, you can turn on debug logging for CloudAPI in one of two ways (below).

First, you should check the log file by running:

    $ less `svcs -L cloudapi`

And looking for any indication of errors.  Note that CloudAPI logs some amount
of request information by default, and logs `WARN` level entries anytime there
is an error sent to the client (including if the error is user initiated). If
you cannot determine the problem of the error from the default logs, turn on
debug logging.

## Debug Logging in SMF

Log messages can be traced using `bunyan -p cloudapi` as explained into
[Bunyan DTrace Examples](https://github.com/trentm/node-bunyan#dtrace-examples)

# Specifying or overriding plugins configuration using UFDS

It's possible to specify CloudAPI's plugins configuration using UFDS, for
example:

        sdc-ldap add << EOD
        dn: cn=provision_limits, ou=config, o=smartdc
        cn: provision_limits
        datacenter: coal
        defaults: {"image": "any", "check": "image", "by": "machines", "value": 4}
        defaults: {"image": "windows", "check": "image", "by": "machines", "value": -1}
        enabled: true
        svc: cloudapi
        objectclass: config
        EOD

Of course, plugins config can be specified either using the cloudapi's config
file or just using UFDS as above. Please, note that **any value specified for
a given plugin using UFDS will automatically override the configuration
specified for such plugin into the cloudapi's configuration file**.

Given the most usual operations once a limit has been created are adding,
replacing or removing concrete entries, the following are examples of how
to do this using ufds:

### Add a new default limit to plugin config:

        sdc-ldap modify << EOD
        dn: cn=provision_limits, ou=config, o=smartdc
        changetype: modify
        add: defaults
        defaults: {"image": "any", "check": "image", "by": "ram", "value": 8192}
        EOD

### Remove a default limit from plugin config:

        sdc-ldap modify << EOD
        dn: cn=provision_limits, ou=config, o=smartdc
        changetype: modify
        delete: defaults
        defaults: {"image": "any", "check": "image", "by": "ram", "value": 8192}
        EOD


### Replace an existing default limit from plugin config (delete + add):


        sdc-ldap modify << EOD
        dn: cn=provision_limits, ou=config, o=smartdc
        changetype: modify
        delete: defaults
        defaults: {"image": "any", "check": "image", "by": "machines", "value": 4}
        -
        add: defaults
        defaults: {"image": "any", "check": "image", "by": "machines", "value": 8}
        EOD


# Appendix A: Provision Limits Plugin

Alternatively to the `capi_limits` plugin shipped with SDC 6.5 version of
Cloud API, version 7.0 comes with a new **Provisioning Limits** plugin which
provides more options and flexibility regarding the limits Cloud API will check
before allowing the provision of a new machine for a given customer.

The following is the configuration fragment expected on the plugins section of
CloudAPI config file in order to enable and set the different options for this
plugin:


     {
          "name": "provisioning_limits",
          "enabled": true,
          "config": {
              "datacenter": ${dc_name} (String),
              "defaults": [{
                  "os": ${image_os} (String),
                  "image": ${image_name} (String),
                  "check": "os" | "image" (String),
                  "by": "ram" | "quota" | "machines" (String),
                  "value": ${value} (Negative Integer|Zero|Positive Integer)
              }, { ... }, ...]
          }
      }

Possible values for every config member are:

| Name | Description | Possible values |
| ---- | ----------- | --------------- |
| datacenter | String `datacenter` name | Name of the datacenter. |
| os | String. Value for Image `os`. | Usually, this will be one of `windows`, `linux`, `smartos`, `bsd` or `any`. See [IMGAPI os values](https://mo.joyent.com/docs/imgapi/master/#manifest-os) for the whole list |
| image | String. Value for Image `name`. | This will be one of `windows`, the different `linux` flavors, different `smartos` based datasets or `any`. See [IMGAPI possible values for image names](https://mo.joyent.com/docs/imgapi/master/#manifest-name) |
| check | String. Either "image" or "os" | See explanation below |
| by | String. The name of the value this limit will be based into. Note that "machines" means "number of machines" | "ram", "quota", or "machines" |
| value | Number. A value for the previous "by" member | Negative Integer, Zero, or Positive Integer |

Note that the values `os` or `image` can be omitted depending on the value
given to `check`. Only the value specified for `check` must be present for
a limit.

For example, the following is a valid limit:

         "os": "linux",
         "check": "os",
         "by": "ram",
         "value": 51200

which just means "make sure that when the operating system for the machine
being provisioned is linux, the total ram used by this customer will not
exceed 51200MiB" and, given it's omitted, we can omit the "whatever is the
dataset name for the image: centos, ubuntu, ...".

You can specify as many "defaults" entries as you want. For example, the
following config fragment means:

> *Disallow provisioning any windows machine and for any other image, allow
> provisioning machines until RAM reaches a limit of 51200, whatever is the
> operating system for these images.*

    "plugins": [
        {
            "name": "provision_limits",
            "enabled": false,
            "config": {
                "datacenter": "DATACENTER_NAME",
                "defaults":[{
                   "os": "any",
                   "dataset": "any",
                   "check": "os",
                   "by": "ram",
                   "value": 51200
                }, {
                   "os": "windows",
                   "dataset": "windows",
                   "check": "dataset",
                   "by": "machines",
                   "value": -1
                }]
            }
        },


This plugin makes use of UFDS 'capilimit' LDAP object to declare individual
customers limits. Expected format for limit objects is similar to the format
used by the "capi\_limits" plugin, but allowing to specify either a number of
machines or RAM or Disk Quota to establish the limit.

When the value given to the attribute "by" is either "ram" or "quota",
the limit specified for these values is expected to be in Megabytes.

Note that, depending on the value of the "check" member, the plugin will
either check the limits against the image family (centos, ubuntu, ...),
like the "capi\_limits" plugin does when the value is "image", or will
just check by image operating system when the given value is "os".

Please, take into consideration that any limit defined for a particular
customer in UFDS will override a default limit with the same rules and
different values, despite of the fact the global limit may or not be more
restrictive than the customer specific one.

Some examples:

      dn: dclimit=coal, uuid=36fa9832-b836-455d-ac05-c586512019e4, ou=users, o=smartdc
      datacenter: coal
      objectclass: capilimit
      limit: {
          image: smartos
          check: image
          by: machines
          value: 1
      }

This would be a different configuration, which would limit provisioning
by disk "quota", and take a value of Infinity for the current customer:

      dn: dclimit=coal, uuid=24c0ee76-9313-4a2c-b6e7-c46dbf769f00, ou=users, o=smartdc
      datacenter: coal
      objectclass: capilimit
      limit: {
          os: linux
          check: os
          by: quota
          value: 0
      }

And, finally, there is an example of the same plugin limiting provisions by
50 GB of "ram":

      dn: dclimit=coal, uuid=4e4f53d0-613e-463e-965f-1c1a50c0d8e1, ou=users, o=smartdc
      datacenter: coal
      objectclass: capilimit
      limit: {
          image: windows
          os: windows
          check: os
          by: ram
          value: 51200
      }

Note that, as for "capi\_limits", a "value" of zero means unlimited quota.

Also, note that is perfectly possible to specify several limits which may
be related to the same image/os like, for example, check that there are a
maximum of 3 machines with the given image/os and a total RAM of 2048MB,
in a way that 3 machines of 512MB each would be perfectly valid, but 4
machines will not, neither will be 2 machines of 1024MB each.

On these cases where there could be more than one limit related to the same
os/image, or even there are "catch all" limits which may also apply, **all the
limits must be satisfied**, with the following exceptions:

- When a "catch all" limit has been specified for a given customer, none of the
global limits will be applied. ("os": "any" or "image": "any").
- When a global "catch all" limit exists, but there is a specific limit for
a customer, which will be applied to the current image/os, the global limit
will not be applied.

These rules are intended to allow things like:

- Define a global limits for all customers, for example, restrict globally to
either 2 machines or 2048GiB of RAM.
- Then, for each customer, be able to override these settings for the
specific images, using either number of machines, RAM or quota, depending on
different factors like, for example, licenses.

Finally, there's a possibility to define two different limits which have
exactly the same meaning: those where you specify a value of "any" for image
and for os. For example, the following limits would apply always:


    os: any
    check: os
    by: whatever
    value: something

and the equivalent "catch all" limit for "image":

    image: any
    check: image
    by: whatever
    value: something_else


On these cases, assuming that "by" value is the same in both limits, both
values must be satisfied which in practice means that the most restrictive
value is being applied.

### Adding limits using UFDS:

The following is an example of adding provisioning limits using ufds:

    sdc-ldap add << EOD
    dn: dclimit=coal, uuid=cc71f8bb-f310-4746-8e36-afd7c6dd2895, ou=users, o=smartdc
    datacenter: coal
    objectclass: capilimit
    limit: {"os": "smartos", "check": "os", "by": "ram", "value": "8192"}
    limit: {"os": "any", "check": "os", "by": "machines", "value": "4"}
    EOD


You can also modify existing capilimit entries (even the old ones used for
capi\_limits plugin), and those would also be perfectly valid provisioning\_limits:

So, for example, if you have an existing limit like:

    dn: dclimit=coal, uuid=d7425eee-bbb1-4abf-b2b8-95ac1eee832f, ou=users, o=smartdc
    base: 10
    datacenter: coal
    objectclass: capilimit


The following would modify it in order to add some extra limits for the customer
without removing the "old" limit of 10 machines of `base` image:


        sdc-ldap modify << EOD
        dn: dclimit=coal, uuid=d7425eee-bbb1-4abf-b2b8-95ac1eee832f, ou=users, o=smartdc
        changetype: modify
        add: limit
        limit: {"os": "smartos", "check": "os", "by": "ram", "value": "8192"}
        -
        add: limit
        limit: {"os": "any", "check": "os", "by": "machines", "value": "4"}
        EOD

(As shown, it's exactly the same if the "value of value" is specified using a
string or a number, the plugin will take care of converting it into a number
when necessary).

<p style="min-height: 31px; margin-top: 60px; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 10px 0">
<a rel="license" href="http://creativecommons.org/licenses/by-nd/3.0/"><img alt="Creative Commons License" style="border-width:0;float:left;margin:4px 8px 0 0;" src="https://i.creativecommons.org/l/by-nd/3.0/88x31.png" /></a> <span xmlns:dct="http://purl.org/dc/terms/" href="http://purl.org/dc/dcmitype/Text" property="dct:title" rel="dct:type">Joyent CloudAPI Administrator's Guide</span> by <a xmlns:cc="http://creativecommons.org/ns#" href="http://www.joyent.com" property="cc:attributionName" rel="cc:attributionURL">Joyent, Inc.</a> is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-nd/3.0/">Creative Commons Attribution-NoDerivs 3.0 Unported License</a>.
</p>
