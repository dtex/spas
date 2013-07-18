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
		input - Adds all requests and passed parameters


	##  Environment
	----------------------------------------------------------------------
	spas has two branches in the configuration file: development and live

	Passing the command line argument "--dev" will use the development node, otherwise live will be used


	## Execution mode
	----------------------------------------------------------------------
	spas can run as a service by passing the "--service" command line argument.

	Without "--service" spas will run in the console

*/

GLOBAL.bundles = {};
GLOBAL.cronjobs = [];
GLOBAL.config = {};

// ## Module dependencies.
var
  // My lib files
  configure = require('./lib/config')
  , winston = require('./lib/logging').winston
  , bundleManager = require('./lib/bundleManager')
  , engine = require('./lib/engine')
  , oauth = require('./lib/oauth')
  , oauth2 = require('./lib/oauth2')
  , keystone2 = require('./lib/keystone2')
  
  // Built in modules
  , http = require('http')
  , url = require('url')
  , querystring = require('querystring')
  , fs = require('fs')
  , spawn = require('child_process').spawn
  
  // Other Dependencies
  , director = require('director')
  , _ = require('underscore')._
;

if (GLOBAL.config.args.create) {
	process.exit();
}

//
// ## Run spas as a service
//
if (GLOBAL.config.args.service) {

	// Specify output and error log file directories
	if (!fs.existsSync(process.cwd() + '/logs')) {
		fs.mkdirSync(process.cwd() + '/logs');
	}
	

	// Spawn the main SPAS application
	var params = GLOBAL.config.isLocal ? ['spas'] : [];
	params.push('--spawned');
	if (GLOBAL.config.args.dev) params.push('--dev');
	if (GLOBAL.config.args.log) {
		params.push('--log');
		params.push(GLOBAL.config.args.log);
	}

	var spasService = spawn(GLOBAL.config.isLocal ? 'node' : 'spas', params, { detached: true, stdio: [ 'ignore', 'ignore', 'ignore' ] });

	spasService.unref();

	process.exit();

} else {

	// ## See if client will accept gzip encoding
	var acceptGZip = function(headers) {
		if (_.has(headers, "accept-encoding") && headers["accept-encoding"].match(/\bgzip\b/)) {
			return true;
		} else {
			return false;
		}
	}
	
	// ## Our Routes
	var router = new director.http.Router({

		// These are the return routes for authentication services
		'/oauth': {
			get: function() {
				var oauth_token = querystring.parse((url.parse(this.req.url).query)).oauth_token;
				
				//winston.info('oauth callback for ' + nonce + ' running');
				winston.debug('Query parameters:' + JSON.stringify(querystring.parse((url.parse(this.req.url).query))));
				
				if (!_.isUndefined(oauth_token) && !_.isUndefined(this.req.headers.cookie)) {
					
					var self = this,
						cookies = {},
						tempCookies = this.req.headers.cookie.split(';');
					
					_.each(tempCookies, function(cookie, index) {
						cookie = cookie.split('=');
						cookies[cookie[0].trim()] = cookie[1].trim();
					});
					
					var bidkey = GLOBAL.config.guids[cookies.authCode].split(',');
					
					var bid = bidkey[0],
						key = bidkey[1];

					oauth.saveOauthToken( GLOBAL.bundles[bid][key], querystring.parse((url.parse(this.req.url).query)).oauth_token, querystring.parse((url.parse(this.req.url).query)).oauth_verifier, bid, key, function( tout ) {
	
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

		// A bundle is being requested using the old, deprecated format 'http://domain.com/bundle/bundlename'
		'/bundle/:bid': {
	    	get: function(bid) {
	    		var gzip = acceptGZip(this.req.headers);
	    		winston.error('Old style bundle request made for ' + bid);
	    		engine.fulfill ( this.res, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress, bid, querystring.parse((url.parse(this.req.url).query)).callback, gzip );
	    	}
		},
		
		// A bundle is being requested in the format 'http://domain.com/bundlename'
		'/:bid': {
	    	get: function(bid) {
	    		var gzip = acceptGZip(this.req.headers);
	    		engine.fulfill ( this.res, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress, bid, querystring.parse((url.parse(this.req.url).query)).callback, gzip );
	    	}
		},

		// A bundle is being requested in the format 'http://bundlename.domain.com'
		'/': {
	    	get: function() {
	    		var gzip = acceptGZip(this.req.headers);
                bid = _.has(this.req.headers, 'host') ? this.req.headers.host.split('.')[0] : '';
                engine.fulfill ( this.res, this.req.headers['x-forwarded-for'] || this.req.connection.remoteAddress, bid, querystring.parse((url.parse(this.req.url).query)).callback, gzip );
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
	bundler.refreshBundles();
	
	server.listen(GLOBAL.config.port);
	winston.info('Listening on port ' + GLOBAL.config.port);
}
