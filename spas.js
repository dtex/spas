/*

The MIT License (MIT)
Copyright (c) 2012 Donovan Buck

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

/*

Command line parameters

	## Logging
	----------------------------------------------------------------------
	To set logging level use command line argument "--log loglevel"

	The valid values for loglevel are:

		error - Logs SPAS errors only
		warn - Adds communication issues with 3rd party API's
		data - [default] Adds all billable transaction events (request to API's & request for bundles)
		info - Adds program flow (function calls, enqueued jobs, etc)
		debug - Adds all datapoints other than API responses and bundles
		verbose - Adds everything (API Responses, conmpleted bundles, etc).
		input - Adds all requests and parameters


	##  Environment
	----------------------------------------------------------------------
	spas has two branches in the configuration file: development and live

	Passing the command line argument "--dev" will use the development node, otherwise live will be used


	## Execution mode
	----------------------------------------------------------------------
	spas can run as a service by passing the "--service" command line argument.

	Without "--service" spas will run in the console

*/

// ## Module dependencies.
var
  // My lib files
  nconf = require('./lib/config').nconf
  , config = require('./lib/config').config
  , winston = require('./lib/logging').winston
  , bundleManager = require('./lib/bundleManager')
  , engine = require('./lib/engine')
  , oauth = require('./lib/oauth')
  , oauth2 = require('./lib/oauth2')
  , keystone2 = require('./lib/keystone2')
  
  // Built in modules
    http = require('http')
  , url = require('url')
  , querystring = require('querystring')
  , fs = require('fs')
  , spawn = require('child_process').spawn
  
  // Other Dependencies
  , director = require('director')
  , _ = require('underscore')._
  , cronJob = require("cron").CronJob
;

if (nconf.get('create')) {
	process.exit();
}

GLOBAL.bundles = {};
GLOBAL.cronjobs = [];

//
// ## Run spas as a service
//
if (nconf.get('service')) {

	// Specify output and error log files
	if (!fs.existsSync(process.cwd() + '/logs')) {
		fs.mkdirSync(process.cwd() + '/logs');
	}
	
	var	out = fs.openSync(process.cwd() + '/logs/spasout.log', 'a'),
		err = fs.openSync(process.cwd() + '/logs/spaserr.log', 'a');

	// Spawn the main SPAS process
	var params = [];
	if (nconf.get('dev')) params.push('--dev');
	if (nconf.get('sample')) params.push('--sample');
	if (nconf.get('log')) {
		params.push('--log');
		params.push(nconf.get('log'));
	}

	var spasService = spawn('spas', params, { detached: true, stdio: [ 'ignore', out, err ] });

	spasService.unref();

	process.exit();

} else {

	// ## Our Routes
	var router = new director.http.Router({

		// These are the return routes for authentication services
		'/oauth': {
			get: function() {
				var nonce = querystring.parse((url.parse(this.req.url).query)).oauth_nonce;
				
				if (!_.isUndefined(nonce)) {
					
					var nonceArray = nonce.split(","),
					bid = nonceArray[0],
					key = nonceArray[1],
					self = this;

					oauth.saveOauthToken( GLOBAL.bundles[bid][key], querystring.parse((url.parse(this.req.url).query)).oauth_nonce, querystring.parse((url.parse(this.req.url).query)).oauth_token, function( tout ) {
	
						if (_.has(tout, 'redirect')) {
							self.res.statusCode = 302;
							self.res.setHeader("Location", tout.redirect);
							self.res.end();
						}
					
					});
				} else {
					
					this.res.writeHead(404);
					this.res.end();
		
				}
				
			}
		},

		'/oauth2': {
			get: function() {
				var self = this;

				winston.info('oauth2 callback reqeusted');
				winston.debug(JSON.stringify(querystring.parse((url.parse(this.req.url).query))));

				oauth2.saveCode ( this.res, querystring.parse((url.parse(this.req.url).query)).state.split(','), querystring.parse((url.parse(this.req.url).query)).code, function( tout ) {
					if (_.has(tout, 'redirect')) {
						self.res.statusCode = 302;
						self.res.setHeader("Location", tout.redirect);
						self.res.end();
					}
				});
			}
		},

		// A bundle is being requested
		'/bundle/:bid': {
	    	get: function(bid) {
	    		var gzip = false;
	    		winston.error('Old style bundle request made for ' + bid);
	    		if (_.has(this.req.headers, "accept-encoding")) {
	    			if  (this.req.headers["accept-encoding"].match(/\bgzip\b/)) {
	    				gzip = true;
	    			}
	    		}
	    		engine.fulfill ( this.res, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress, bid, GLOBAL.bundles[bid], querystring.parse((url.parse(this.req.url).query)).callback, gzip );
	    	}
		},
		
		// A bundle is being requested
		'/:bid': {
	    	get: function(bid) {
	    		var gzip = false;
	    		if (_.has(this.req.headers, "accept-encoding")) {
	    			if  (this.req.headers["accept-encoding"].match(/\bgzip\b/)) {
	    				gzip = true;
	    			}
	    		}
	    		engine.fulfill ( this.res, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress, bid, GLOBAL.bundles[bid], querystring.parse((url.parse(this.req.url).query)).callback, gzip );
	    	}
		},

		// A bundle is being requested
		'/': {
	    	get: function() {
	    		var gzip = false;
                if (_.has(this.req.headers, 'host')) {
                        bid = this.req.headers.host.split('.')[0];
                } else {
                        bid = '';
                }

	    		if (_.has(this.req.headers, "accept-encoding") && this.req.headers["accept-encoding"].match(/\bgzip\b/)) {
	    				gzip = true;
	    		}
	    		
	    		engine.fulfill ( this.res, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress, bid, GLOBAL.bundles[bid], querystring.parse((url.parse(this.req.url).query)).callback, gzip );
	    	}
		}
	});
	
	// ### Create our server
	var server = http.createServer(function (req, res) {
		router.dispatch(req, res, function (err) {
			if (err) {
				res.writeHead(404);
				res.end();
			}
		});
	});

	//
	// ## Listener for bundle updater
	//
	var bundler = new bundleManager();
	bundler.on('bundlesUpdated', function(newBundles) {
		
		winston.info('event bundlesUpdated');
		bundles = newBundles;
		
		// ### Stop all the existing scheduled jobs
		_.each(GLOBAL.cronjobs, function (job, idx) {
	    	job.stop();
	    	delete job;
		});
		
		GLOBAL.cronjobs = [];
		
		// ### Schedule jobs defined in bundles
		_.each(bundles, function (bundle, bid) {
			_.each(bundle, function (api, key) {
				if (api.schedule) {
					var job = new cronJob(api.schedule, function(){
			    		winston.info('cronjob '+key+' called');
			    		engine.refresh(api, key, bid, bundle);  
			    	}, null, true);
			    	GLOBAL.cronjobs.push(job);
			    }
			});
		});
	
	});
	
	bundler.refreshBundles();
	
	server.listen(config.port);
	winston.info('Listening on port ' + config.port);
}
