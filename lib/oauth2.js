var redis = require("redis")
  , _ = require('underscore')._
  , neuron = require('neuron')
  , winston = require('./logging').winston
  , oauth2 = require('oauth').OAuth2
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
		winston.info('Run job oauth2:finishAuth');
		cb(tout, authParams);
	}
});

manager.addJob('getCode', {
	work: function( api, bid, key, cb ) {
		
		winston.info('Run job oauth2:getCode');
		
		var oaData = GLOBAL.config.authentication[api.auth.provider];

		var oa = new oauth2(oaData.client_id,
			oaData.client_secret,
			oaData.baseSite,
			oaData.authorizePath,
			oaData.accessTokenPath),
            self = this;
              
        var tout = {
			expires: new Date(),
			redirect: oa.getAuthorizeUrl({
				'response_type': 'code', 
				'redirect_uri': GLOBAL.config.url+'/oauth2', 
				'scope': api.auth.scope,
				'state': bid + "," + key,
				'access_type': 'offline',
				'approval_prompt': 'force'
			}),
			err: {errnum:1, errtxt:"Authentication provider requires code."},
			cname: key
		};
		
		winston.debug(JSON.stringify(tout));
		
		manager.enqueue('finishAuth', tout, cb);
		self.finished = true;		        				   
	}
});

manager.addJob('getAccessToken', {
	
	work: function(api, bid, key, cb, grant_type) {
		winston.info('Run job oauth2:getAccessToken(' + grant_type + ')');
		var oaData = GLOBAL.config.authentication[api.auth.provider],
			self = this;
		var oa = new oauth2(oaData.client_id,
			oaData.client_secret,
			oaData.baseSite,
			oaData.authorizePath,
			oaData.accessTokenPath),
            self = this;
        
        winston.debug('api = ' + JSON.stringify(api));    
        winston.info('oaData = ' + JSON.stringify(oaData));
        //oa.setAccessTokenName(api.credentials.access_token);
        
        var params = {
        	"grant_type": grant_type
        }
        
        var thisCode = api.credentials.code;
        
        if (grant_type !== 'refresh_token') {
	        params.redirect_uri = GLOBAL.config.url + '/oauth2';
	    } else {
	    	thisCode = api.credentials.refresh_token;
        }
        
        winston.info('thisCode = ' + thisCode);
        winston.info('params  = ' + JSON.stringify(params));
        
        oa.getOAuthAccessToken(thisCode, params, function(error, access_token, refresh_token, results) {
	    	winston.info('Run callback for oauth2:getOAuthAccessToken');
	    	if(error) {
		        winston.error('Error oauth2:getOAuthAccessToken('+bid+key+'): '+JSON.stringify(error));
		        var tout = {
	  				expires: new Date(),
	  				err: error,
	  				cname: key
	  			};
	  			manager.enqueue('finishAuth', tout, cb);
		        self.finsihed = true;
	    	} else { 
	        	winston.debug('access_token = '+access_token);
	        	
	        	api.credentials.type = 'oauth2';
	        	api.credentials.provider = api.auth.provider;
	        	api.credentials.access_token = access_token;
	        	
	        	winston.debug('typeof refresh_token = '+typeof refresh_token);
	        	if (typeof refresh_token !== 'undefined') {
	        		winston.debug('first refresh token = '+refresh_token);
	        		api.credentials.refresh_token = refresh_token;
	        	}
	        	
	        	api.credentials.expires = new Date().add({seconds: (results.expires_in - 300)});
	        	
	        	winston.debug(JSON.stringify(api.credentials));

	        	client.set(bid+key+'oauth2', JSON.stringify(api.credentials));
	  			winston.debug(bid+key+'oauth2 saved');
	  			manager.enqueue('finishAuth', true, cb, { "access_token": api.credentials.access_token });
	  			self.finished = true;
	  		}
	   });
	}
})

exports.authorize = function( api, bid, key, cb ) {
	
	winston.info('function oauth2:authorize');
	
	// See if we have an oauth record in the database
	client.get(bid+key+'oauth2', function (err, doc) {
		
		if (err || doc === null) { 
			
			manager.enqueue('getCode', api, bid, key, cb );
					        
		} else {
			
			api.credentials = JSON.parse(doc);
			api.credentials.expires = new Date(api.credentials.expires);
				
			if (_.has(api.credentials, 'access_token')) {
				if (api.credentials.expires.isBefore(new Date())) {
					manager.enqueue('getAccessToken', api, bid, key, cb, 'refresh_token' );
				} else {
					manager.enqueue('finishAuth', true, cb, { "access_token": api.credentials.access_token });
				}
			} else {
				manager.enqueue('getAccessToken', api, bid, key, cb, 'authorization_code' );
			}
		}
		
	});
}

exports.saveCode = function( res, state, code, cb) {
	
	winston.info('function oauth2:saveCode');
	
	var doc = {"code": code };
	client.set(state[0]+state[1]+'oauth2', JSON.stringify(doc));
	var tout = {
		expires: new Date(),
		redirect: GLOBAL.config.url + '/bundle/' + state[0]
	}
	
	manager.enqueue('finishAuth', tout, cb);
	
}
