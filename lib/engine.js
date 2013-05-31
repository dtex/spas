var 
  redis = require("redis")
  , _ = require('underscore')._
  , neuron = require('neuron')
  , zlib = require('zlib')
  , winston = require('./logging').winston
  , bundleManager = require('./bundleManager')
  , cronJob = require("cron").CronJob
  , oauth = require("./oauth")
  , oauth2 = require('./oauth2')
  //, crypto = require('crypto')
  //, sha = crypto.createHash('sha1')
;
  
require('date-utils');

// Connect to redis
var client = redis.createClient(GLOBAL.config.redis.port, GLOBAL.config.redis.address);
if (GLOBAL.config.redis.auth) {
	client.auth(GLOBAL.config.redis.auth, function (err) {
		if (err) { 
			// handle err; 
		}
	});
}

//
// ## Recursive function to remove unwanted elements from API response
//
var filter = function( source, map) {
	if (_.isArray(source)) {
		_.each(source, function(item, index) { filter( item, map[0]); });
	} else {
		if (_.isString(source) || map === true || _.isUndefined(map)) return 0;
		_.each(source, function(obj, key, source) {
			if (_.isUndefined(map[key])) {
				delete source[key];
			} else {
				filter( obj, map[key]);
			}
		});
	};	
}

//
// ## Perform scheduled refresh
//
exports.refresh = function(api, key, bid, bundle) {
	
	winston.info('exports.refresh: ' + api);
	// We're forcing a refresh of the content so run the api.code
	api.resource( api.params, api.credentials, function( err, res ) {
		if ( err ) {
			
			// We got an error so set our output object to be the error and expire immediately
			api.expires = ( new Date() );
  			var tout = {
  				expires: api.expires,
  				result: err,
  				iid: bid+key,
  				cname: key,
  				scheduled: true
  			};
				
		} else {
			
  			winston.event('Get data for ' + bid + ' from ' + key + ', ' + res.size);
  			
  			// Filter the response
  			if (_.has(api.filter)) {
	  			filter ( res, api.filter );
  			}
			
			// Perform cleanup function on API response
  			if (_.has(api, 'cleanup')) {
	  			res = api.cleanup(res);
  			}
			
			// Build the stored response
  			api.expires = ( new Date() ).addSeconds( api.cacheduration );
  			bundle[key] = api;
  		
  			var tout = {
  				expires: api.expires,
  				result: res,
  				iid: api.iid,
  				cname: key,
  				scheduled: true
  			};
	   		
	   		// Save response to Redis
	   		client.set(bid+key, JSON.stringify(tout));
	   		
	   		// Update the bundle
	   		client.del('bid'+bid);
		}
  	});
	
}

//
// ## Retrieve the requested bundle
//
exports.fulfill = function ( myRes, ip, bid, callback, gzip, override ) {
	
	winston.info('exports.fulfill: ' + bid);
	
	var bundle = GLOBAL.bundles[bid];
	
	// If the user requested a bundle that is not defined
	if (typeof bundle === 'undefined') {
		myRes.writeHead(404);
		myRes.end();
		return false;
	}
	
	// Count the number of queries in this bundle so we know when we are ready to respond
	var queriesInThisBundle = _.size(bundle),
		thisResponse = {};
		
	// cleanup is not an API request
	if(_.has(bundle, 'cleanup')) {
		queriesInThisBundle--;
	}

	// If override was not passed
	if( _.isUndefined( override )) {
		
		// Retrieve bundle response from Redis
		client.get('bid'+bid, function ( err, doc ) {	
			
			if ( err || doc === null ) {
				// There was an error so force refresh on bundle
				exports.fulfill( myRes, ip, bid, callback, gzip, true );

			} else {
				
				jDoc = JSON.parse( doc );
				
				// If there is a valid expiration date for the bundle
				jDoc.expires = new Date(jDoc.expires);
				if ( 'expires' in jDoc && _.isDate(jDoc.expires) ) {
					jDoc.secleft = jDoc.expires.getSecondsBetween( new Date() ) * -1;
				} else {
					// This should never happen
					jDoc.secleft = 0;
				}
				
				if (Number(jDoc.secleft) < 0 ) {

					// The bundle has expired. Force a refresh
					exports.fulfill( myRes, ip, bid, callback, gzip, true );
					
				} else {
					
					//Respond with the cached data
					jDoc.fromcache = true;
					var responseType = callback ? 'application/javascript' : 'application/json';
					var responseHeaders = {'Content-Type': responseType, 'max-age': jDoc.secleft, 'cache-control': 'public, max-age='+jDoc.secleft+', no-transform', "Expires": jDoc.expires };
					
					doc = JSON.stringify(jDoc);
					
					// If a callback name was passed, use it. Otherwise, just output the object
					var tbuf = new Buffer(  ( !callback ) ? doc : callback + '('  + doc +  ');');

					if (gzip) {
		
						zlib.gzip(tbuf.toString(), function(err, zbuf) {
						  if (!err) {
						    winston.event('Send gzipped response for ' + bid +', ' + zbuf.toString().length + ', ' + ip);
						    myRes.writeHead(200, {'Content-Type': responseType, 'max-age': jDoc.secleft, 'cache-control': 'public, max-age='+jDoc.secleft+', no-transform', "Expires": jDoc.expires, 'content-encoding': 'gzip' });
						    myRes.end(zbuf);
						  } 
						});
					} else {
						myRes.writeHead(200, responseHeaders);
						winston.event('Send response for ' + bid +', ' + doc.length + ', ' + ip);
						myRes.end(tbuf);
					}
					
				}
			}
		});	
	
	} else {
		
		// ### Override was passed so we are forcing a refresh on the bundle
		var manager = new neuron.JobManager();
		
		manager.on('empty', function (job) {
			
			winston.info('manager:empty');
			
			if (job.name === 'finishRequest' && queriesInThisBundle === 0) {
				var done = true;
				
				_.each(manager.job, function(job, key) {
					if (_.size(job.waiting)  !== 0 || _.size(job.running) !== 0 || job.queue.length !== 0) {
        				done = false;
        			}
        		});
        		
        		if (done) manager.enqueue('composeResponse', bid);
			}
		});
		
		manager.addJob('fulfillPart', {
			work: function(api, bid, key, override, cachedPart) {

				winston.info('manager:fulfillPart: ' + bid + '.' + key + ', override: '+override);
				
				var self = this;
				
				if ( _.isUndefined( override ) ) {
					
					// Load the cached api response from Redis
			  		client.get(bid+key, function (err, doc) {
			  			if (err || doc === null){ 
			  				self.finished = true;
			  				manager.enqueue('fulfillPart', api, bid, key, true );
			  			} else {
				  			
				  			doc = JSON.parse( doc );
				  			doc.expires = new Date(doc.expires);
				  			if ( ('expires' in doc) && _.isDate(doc.expires) ) {
				  				var secleft = doc.expires.getSecondsBetween( new Date() ) * -1;
				  			}
				  			if (secleft < 0) {
				  				self.finished = true;
				  				manager.enqueue('fulfillPart', api, bid, key, true, doc );
				  			} else {
				  				doc.fromcache = true;				  			
				  				manager.enqueue('finishRequest', doc );	
				  				self.finished = true;	 			
				  			}
				  		}
				  	}); 
				  	
				} else {

					if (_.has( api, 'auth')) { 
						
						winston.info('Bundle uses auth type ' + api.auth.type);
						// If the API request object has an auth scheme defined
						if (api.auth.type == 'oauth') {
							oauth.authorize (api, bid, key, function( result, authParams ) { 
								if (result === true) {
									api.params = _.extend(api.params, authParams);
									manager.enqueue('startRequest', api, key, cachedPart, bid);
								} else {
									manager.enqueue('finishRequest', result );
								}
								self.finished = true;
							});
						} else if (api.auth.type == 'oauth2') {
							oauth2.authorize (api, bid, key, function( result, authParams ) { 
								if (result === true) {
									api.params = _.extend(api.params, authParams);
									manager.enqueue('startRequest', api, key, cachedPart, bid);
								} else {
									manager.enqueue('finishRequest', result );
								}
								self.finished = true;
							});
						} else {
							winston.error('auth type ' + api.auth.type + ' not recognized');
						}
					} else {
						// Authentication is not needed
						self.finished = true;
						manager.enqueue('startRequest', api, key, cachedPart, bid);
					}
						
				}
				
			}
		});
		
		manager.addJob('startRequest', {
			work: function( api, key, cachedPart, bid ) {
				
				winston.info('manager:startRequest: ' + key);
				
				var self = this;
						
				if (_.has( api, 'timeout') && _.isObject(cachedPart)) {
					self.timeout = setTimeout(function(self) {
						if(_.isObject(cachedPart)) {
							cachedPart.timeout = true;
							cachedPart.fromcache = true;
						} else {
							cachedPart= {
								"cname": key,
								"timeout" : true,
								"fromcache" : false
							};
						}
						manager.enqueue('finishRequest', cachedPart );	
						self.finished = true;
					}, api.timeout, self)
				}
				
				api.resource( api.params, api.credentials, function( err, res ) {
		  			clearTimeout(self.timeout)
		  			delete self.timeout;
		  			
		  			if ( err ) {
		  				
		  				api.expires = ( new Date() );
			  			tout = _.isUndefined(cachedPart) ? {} : cachedPart;
			  			tout.cname = key;
			  			tout.expires = api.expires;
			  			tout.result = res;
			  			tout.fromcache = true;
			  			tout.err = err;
		  				
		  			} else {
		  			
			  			winston.event('Get data for ' + bid + ' from ' + key + ', ' + res.size);
  			
			  			// Filter the response
			  			if (_.has(api, 'filter')) {
				  			filter ( res, api.filter );
			  			}
			  			
			  			// Perform cleanup function on API response
			  			if (_.has(api, 'cleanup')) {
				  			res = api.cleanup(res);
			  			}
			  			
			  			// Build the stored response
			  			api.expires = ( new Date() ).addSeconds( api.cacheduration );
			  			bundle[key] = api;
			  			//client.set('bundle'+bid, JSON.stringify(bundle));
			  			var tout = {
			  				expires: api.expires,
			  				result: res,
			  				iid: api.iid,
			  				cname: key
			  			};
				   		
				   		// Save response to Redis
				   		client.set(bid+key, JSON.stringify(tout));
				   	}
					manager.enqueue('finishRequest', tout );	
	  				self.finished = true;
			  	});
			}
		})
		
		manager.addJob('finishRequest', {
			work: function(apiResponse) {
				
				winston.info('manager:finishRequest');
				
				queriesInThisBundle--;
				
				if (_.has(apiResponse, 'redirect')) thisResponse.redirect = apiResponse.redirect;
				thisResponse[apiResponse.cname] = apiResponse;
			  	
			  	this.finished = true;
			}
		});
		
		manager.addJob('composeResponse', {
			work: function() {
				
				winston.info('manager:composeResponse');
				
				// Update the expiration date on the bundle
				var tout = {
					expires: _.min( thisResponse, function( val ) { return val.expires } ).expires, 
				};
				
				if (_.has( thisResponse, 'redirect')) tout.redirect = thisResponse.redirect;
				
				// Insert api responses into bundle
				_.each( thisResponse, function( val, idx ) {
					tout[val.cname] = val;
				});
				
				// Perform cleanup function on bundle
			  	if (_.has(bundle, 'cleanup')) {
				  	tout = bundle.cleanup(tout);
				}
	
				// Save cached bundle in Redis
				client.set('bid'+bid, JSON.stringify(tout));
				
				// Determine the seconds left before expiry
				if ( 'expires' in tout && _.isDate(tout.expires) ) {
					tout.secleft = tout.expires.getSecondsBetween( new Date() ) * -1;
				} else {
					tout.secleft = 3600;
				}
				
				manager.enqueue('sendResponse', tout);
				this.finished = true;
				
			}
		});
		
		manager.addJob('sendResponse', {
			work: function(doc) {
				
				winston.info('manager:sendResponse');
				
				if (_.has(doc, 'redirect')) {
					myRes.statusCode = 302;
					myRes.setHeader("Location", doc.redirect);
					myRes.end();
					this.finished = true;
				} else {
					
					// Send the results
					var responseType = callback ? 'application/javascript' : 'application/json';
					var responseHeaders = {'Content-Type': responseType, 'max-age': doc.secleft, 'cache-control': 'public, max-age='+doc.secleft+', no-transform', "Expires": doc.expires };
					
					var responseType = callback ? 'application/javascript' : 'application/json';
					var responseHeaders = {'Content-Type': responseType, 'max-age': doc.secleft, 'cache-control': 'public, max-age='+doc.secleft+', no-transform', "Expires": doc.expires };
					
					// If a callback name was passed, use it. Otherwise, just output the object
					var tbuf = new Buffer(  ( !callback ) ? JSON.stringify( doc ) : callback + '('  + JSON.stringify( doc ) +  ');');
	
					if (gzip) {
		
						zlib.gzip(tbuf.toString(), function(err, zbuf) {
						  if (!err) {
						    myRes.writeHead(200, {'Content-Type': responseType, 'max-age': doc.secleft, 'cache-control': 'public, max-age='+doc.secleft+', no-transform', "Expires": doc.expires, 'content-encoding': 'gzip' });
						    myRes.end(zbuf);
						    this.finished = true;
						  } 
						});
					} else {
						myRes.writeHead(200, responseHeaders);
						myRes.end(tbuf);
						this.finished = true;
					}
				}
			}
		});
		
		_.each( bundle, function( api, key ) {	
			if (key !== 'cleanup') {
				if (_.isUndefined(api, 'credentials')) {
					api.credentials = {};
				}	
				manager.enqueue('fulfillPart', api, bid, key);
			}
		});
		
	}
}