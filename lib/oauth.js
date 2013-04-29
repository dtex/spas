var config = require('./config').config
  , redis = require("redis")
  , _ = require('underscore')._
  , neuron = require('neuron')
  , winston = require('./logging').winston
  , oauth = require('oauth').OAuth
;
  
require('date-utils');

/*
	Connect to redis
*/
var client = redis.createClient(config.redis.port, config.redis.address);
if (config.redis.auth) {
	client.auth(config.redis.auth, function (err) {
		if (err) { 
			// handle err; 
		}
	});
}

var manager = new neuron.JobManager();

manager.addJob('finishAuth', {
	work: function( tout, cb ) {
		cb(tout);
	}
});

manager.addJob('getTemporaryCredentials', {
	work: function( api, bid, key, cb ) {
		
		var oaData = config.authentication[api.auth.provider];
		var oa = new oauth(oaData.requestTemporaryCredentials,
              oaData.requestAccessToken,
              oaData.oauth_consumer_key,
              oaData.client_secret,
              oaData.version,
              oaData.authorize,
              oaData.encryption),
              self = this;
              
        oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
            if(error) {
	            manager.enqueue('finishAuth', false, cb);
	            self.finished = true;
	        } else { 
		        api.credentials = {
		        	'oauth_token': oauth_token,
		        	'oauth_token_secret': oauth_token_secret
		        };
		        client.set(bid+key+'oauth', JSON.stringify(api.credentials));
            	var tout = {
	  				expires: new Date(),
	  				redirect: oaData.authorize+
	  					"?oauth_token="+api.credentials.oauth_token+"&oauth_nonce="+bid+","+key,
	  				err: {errnum:1, errtxt:"Authentication provider requires code."},
	  				cname: key
	  			};
	  			manager.enqueue('finishAuth', tout, cb);
  				self.finished = true;		        				   
			}
		});
	}
});

manager.addJob('getAccessToken', {
	work: function(api, bid, key, oauth_token, cb) {
		
		var oaData = config.authentication[api.auth.provider],
			self = this;
		
		var oa = new oauth(oaData.requestTemporaryCredentials,
              oaData.requestAccessToken,
              oaData.oauth_consumer_key,
              oaData.client_secret,
              oaData.version,
              oaData.authorize,
              oaData.encryption);
		
		oa.getOAuthAccessToken(oauth_token, api.credentials.oauth_token_secret, function(error, oauth_access_token, oauth_access_token_secret, results2) {
	    
	    	if(error) {
		        // handle error
		        manager.enqueue('finishAuth', false, cb);
		        self.finsihed = true;
	    	} else { 
	        	api.credentials.oauth_access_token = oauth_access_token;
	        	api.credentials.oauth_token_secret = oauth_access_token_secret;
	        	api.credentials.oauth_consumer_key = oaData.oauth_consumer_key;
	        	api.credentials.authConfig = oaData;
	        	client.set(bid+key+'oauth', JSON.stringify(api.credentials));
	        	var tout = {
	  				expires: new Date(),
	  				redirect: config.url+'/bundle/'+bid,
	  				err: {errnum:1, errtxt:"Authentication provider requires code."},
	  				cname: key
	  			};
	  			manager.enqueue('finishAuth', tout, cb);
	  			self.finsihed = true;
	  		}
	   });
	}
})

exports.authorize = function( api, bid, key, cb ) {
	
	// See if we have an oauth record in the database
	client.get(bid+key+'oauth', function (err, doc) {
		
		if (err || doc === null) { 
			
			manager.enqueue('getTemporaryCredentials', api, bid, key, cb );
					        
		} else {
			
			api.credentials = JSON.parse(doc);
			
			if (_.has(api.credentials, 'oauth_access_token')) {
				manager.enqueue('finishAuth', true, cb);
			} else {
				manager.enqueue('getTemporaryCredentials', api, bid, key, cb );
			}
		}
		
	});
}

exports.saveOauthToken = function( api, nonce, oauth_token, cb) {
	
	var nonce = nonce.split(","),
		bid = nonce[0],
		key = nonce[1];
	
	client.get(bid+key+'oauth', function(err, doc) {
		
		if (err || doc === null) { 
			// handle error here
		} else {
			api.credentials = JSON.parse(doc);

			manager.enqueue('getAccessToken', api, bid, key, oauth_token, cb)

		}
		
	});
	
}
