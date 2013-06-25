var redis = require("redis")
  , _ = require('underscore')._
  , neuron = require('neuron')
  , winston = require('./logging').winston
  , oauth = require('oauth').OAuth
  , uuid = require("node-uuid")
;
  
require('date-utils');

/*
	Connect to redis
*/
var client = redis.createClient(GLOBAL.config.redis.port, GLOBAL.config.redis.address);
if (GLOBAL.config.redis.auth) {
	client.auth(GLOBAL.config.redis.auth, function (err) {
		if (err) { 
			// handle err; 
		}
	});
}

var manager = new neuron.JobManager();

manager.addJob('finishAuth', {
	work: function( tout, cb, authParams ) {
		cb(tout, authParams);
		this.finished = true;
	}
});

manager.addJob('getTemporaryCredentials', {
	work: function( api, bid, key, cb ) {
		
		winston.info ('getTemporaryCredentials called for ' + bid + ', ' + key);
		
		var oaData = GLOBAL.config.authentication[api.auth.provider];
		var oa = new oauth(oaData.requestTemporaryCredentials,
              oaData.requestAccessToken,
              oaData.oauth_consumer_key,
              oaData.client_secret,
              oaData.version,
              oaData.authorize_callback,
              oaData.encryption),
              self = this;
              
        oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
            if(error) {
	            winston.error(error);
	            manager.enqueue('finishAuth', error, cb);
	            self.finished = true;
	        } else { 
		        api.credentials = {
		        	'oauth_token': oauth_token,
		        	'oauth_token_secret': oauth_token_secret,
		        	'type': 'oauth',
		        	'provider': api.auth.provider
		        };
		        client.set(bid+key+'oauth', JSON.stringify(api.credentials));
            	var tout = {
	  				expires: new Date(),
	  				redirect: oaData.authorize+"?oauth_token="+api.credentials.oauth_token,
	  				err: {errnum:1, errtxt:"Authentication provider requires code."},
	  				cname: key,
	  				guid: uuid.v4()
	  			};
	  			winston.debug('Authorize redirect response:' + JSON.stringify(tout));
	  			manager.enqueue('finishAuth', tout, cb);
  				self.finished = true;		        				   
			}
		});
	}
});

manager.addJob('getAccessToken', {
	work: function(api, bid, key, oauth_token, oauth_verifier, cb) {
		
		winston.info('Running getAccessToken for ' + bid + ', ' + key);
		var oaData = GLOBAL.config.authentication[api.auth.provider],
			self = this;
		
		var oa = new oauth(oaData.requestTemporaryCredentials,
              oaData.requestAccessToken,
              oaData.oauth_consumer_key,
              oaData.client_secret,
              oaData.version,
              oaData.authorize_callback,
              oaData.encryption);
			  
			  winston.debug('oauth_token:' + oauth_token + ' api.credentials.oauth_token_secret:' + api.credentials.oauth_token_secret);
			  
        oa.getOAuthAccessToken(oauth_token, api.credentials.oauth_token_secret, oauth_verifier, function(error, oauth_access_token, oauth_access_token_secret, results2) {
	    
	    	if(error) {
		        // handle error
		        winston.error(error);
		        manager.enqueue('finishAuth', error, cb);
		        self.finished = true;
	    	} else { 
	        	api.credentials.oauth_access_token = oauth_access_token;
	        	api.credentials.oauth_token_secret = oauth_access_token_secret;
	        	api.credentials.oauth_consumer_key = oaData.oauth_consumer_key;
	        	api.credentials.authConfig = oaData;
	        	client.set(bid+key+'oauth', JSON.stringify(api.credentials));
	        	var tout = {
	  				expires: new Date(),
	  				redirect: GLOBAL.config.url+'/bundle/'+bid,
	  				err: {errnum:1, errtxt:"Authentication provider requires code."},
	  				cname: key
	  			};
	  			manager.enqueue('finishAuth', tout, cb, {
					"oauth_consumer_key": api.credentials.oauth_consumer_key, 
					//"oauth_nonce": bid+","+key,
					//"oauth_signature": xxx,
					"oauth_signature_method": oaData.encryption,
					"oauth_timestamp": Math.floor( (new Date()).getTime() / 1000 ),
					"oauth_token": api.credentials.oauth_access_token
				});
	  			self.finished = true;
	  		}
	   });
	}
})

exports.authorize = function( api, bid, key, cb ) {

	winston.info('oauth authorize called for ' + bid +', ' + key);
	
	if (!_.has(GLOBAL.config, 'authentication') || !_.has(GLOBAL.config.authentication, api.auth.provider)) {
		winston.error('Authentication provider ' + api.auth.provider + ' not defined');
		return false;
	}
	
	var oaData = GLOBAL.config.authentication[api.auth.provider];
	
	// See if we have an oauth record in the database
	client.get(bid+key+'oauth', function (err, doc) {
		
		if (err || doc === null) { 
			
			manager.enqueue('getTemporaryCredentials', api, bid, key, cb );
					        
		} else {
			
			api.credentials = JSON.parse(doc);
			
			if (_.has(api.credentials, 'oauth_access_token')) {
				manager.enqueue('finishAuth', true, cb, {
					"oauth_consumer_key": api.credentials.oauth_consumer_key, 
					//"oauth_nonce": bid+","+key,
					//"oauth_signature": xxx,
					"oauth_signature_method": oaData.encryption,
					"oauth_timestamp": Math.floor( (new Date()).getTime() / 1000 ),
					"oauth_token": api.credentials.oauth_access_token
				});
			} else {
				manager.enqueue('getTemporaryCredentials', api, bid, key, cb );
			}
		}
		
	});
}

exports.saveOauthToken = function( api, oauth_token, oauth_verifier, bid, key, cb) {
	
	winston.info('Running saveOauthToken for ' + bid + ', ' + key);
	
	client.get(bid+key+'oauth', function(err, doc) {
		
		if (err || doc === null) { 
			// handle error here
		} else {
			api.credentials = JSON.parse(doc);
			if (oauth_verifier) api.credentials.oauth_verifier = oauth_verifier;

			manager.enqueue('getAccessToken', api, bid, key, oauth_token, oauth_verifier, cb)

		}
		
	});
	
}

exports.OAuth = oauth