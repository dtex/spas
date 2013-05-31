var request = require("request")
  , redis = require("redis")
  , _ = require('underscore')._
  , neuron = require('neuron')
  , winston = require('./logging').winston
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

manager = new neuron.JobManager();
	
/*
manager.on('empty', function (job) {
	
});
*/
/*
manager.addJob('getCode', {
	work: function( api, bid, key,  cb ) {
		winston.verbose('--- getCode --- ');
		var oaData = config.authentication[api.auth.provider];
		var self = this;
		var tout = {
  			expires: new Date(),
  			getCode: oaData.oauth2code+
  				"?response_type=code&client_id=" + oaData.client_id +
  				"&redirect_uri=" + config.url +
  				"/auth&scope=" + api.auth.scope +
  				"&state=" + bid + "," + key +
  				"&access_type=offline&approval_prompt=force",
  			err: {errnum:1, errtxt:"Authentication provider requires code."},
  			cname: key
  		};
  		manager.enqueue('finishAuth', tout, cb);
  		self.finished = true;
  	}
});
*/
/*
manager.addJob('getTokens', {
	work: function( api, bid, key, cb ) {
		winston.verbose('--- getTokens ---');
		var oaData = config.authentication[api.auth.provider],
			self = this;
		winston.verbose('code='+api.credentials.code+
					'&client_id='+oaData.client_id+
					'&client_secret='+oaData.client_secret+
					'&redirect_uri='+config.url + "/auth" +
					'&grant_type=authorization_code');
		request(
			{
				uri:oaData.oauth2token,
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: 'code='+api.credentials.code+
					'&client_id='+oaData.client_id+
					'&client_secret='+oaData.client_secret+
					'&redirect_uri='+config.url + "/auth" +
					'&grant_type=authorization_code'
			}, 
			function (err, myres, body) {
				winston.verbose('getTokens response', body);
				var jsRes = JSON.parse(body);
				
				api.credentials.access_token = jsRes.access_token;
				api.credentials.refresh_token = jsRes.refresh_token;
				api.credentials.expires = new Date().add({seconds: jsRes.expires_in});
				winston.verbose('SET', bid+key+'oauth2', JSON.stringify(api.credentials));
				
				client.set(bid+key+'oauth2', JSON.stringify(api.credentials));
				
				manager.enqueue('finishAuth', true, cb);
				self.finished = true;
			}
		);
	}
});
*/
/*
manager.addJob('refreshTokens', {
	work: function( api, bid, key, cb ) {
		winston.verbose('--- refreshTokens ---');
		winston.verbose('api', api);
		
		var oaData = config.authentication[api.auth.provider],
			self = this;
		winston.verbose(oaData.oauth2token);
		winston.verbose('client_id='+oaData.client_id+
					'&client_secret='+oaData.client_secret+
					'&refresh_token='+api.credentials.refresh_token +
					'&grant_type=refresh_token');
		request(
			{
				uri:oaData.oauth2token,
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: 'client_id='+oaData.client_id+
					'&client_secret='+oaData.client_secret+
					'&refresh_token='+api.credentials.refresh_token +
					'&grant_type=refresh_token'
			}, 
			function (err, myres, body) {
				winston.verbose('refreshTokens response', body);
				var jsRes = JSON.parse(body);
				
				api.credentials.access_token = jsRes.access_token;
				api.credentials.expires = new Date().add({seconds: jsRes.expires_in});
				
				winston.verbose('SET', bid+key+'oauth2', JSON.stringify(api.credentials));
				
				client.set(bid+key+'oauth2', JSON.stringify(api.credentials));
				
				manager.enqueue('finishAuth', true, cb);
				self.finished = true;
			}
		);

		//manager.enqueue('finishAuth', true, cb);
		//self.finished = true;
	}
});
*/
/*
manager.addJob('finishAuth', {
	work: function( tout, cb ) {
		winston.verbose('--- finishAuth ---');
		cb(tout);
	}
});
*/
/*
exports.saveCode = function( res, state, code) {
	winston.verbose('--- saveCode ---');
	var doc = {"code": code };
	winston.verbose('SET', state[0]+state[1]+'oauth2', JSON.stringify(doc));
			
	client.set(state[0]+state[1]+'oauth2', JSON.stringify(doc));
	res.end("<script type=\"text/javascript\">window.location.href = '" + config.url + "/bundle/" + state[0] + "';</script>");
}
*/
/*
exports.revoke = function( res, creds ) {
	winston.verbose('--- revoke ---');
	client.del(creds+'oauth2');
	res.end("<p>Credentials revoked</p>");
}
*/
/*
exports.authorize = function( api, bid, key, cb ) {
	winston.verbose('--- authorize ---');
	// See if we have an oauth2 record in the database
	client.get(bid+key+'oauth2', function (err, doc) {
		if (err || doc === null) { 
			manager.enqueue('getCode', api, bid, key, cb);
		} else {
			winston.verbose(bid+key+'oauth2', doc);
			api.credentials = JSON.parse(doc);
			api.credentials.expires = new Date(api.credentials.expires);
			if (_.has(api.credentials, 'access_token')) {
				winston.verbose('has access_token');
				if (api.credentials.expires.isBefore(new Date())) {
					winston.verbose('It has expired. Calling refreshTokens');
					manager.enqueue('refreshTokens', api, bid, key, cb);
				} else {
					manager.enqueue('finishAuth', true, cb);
				}
			} else {
				manager.enqueue('getTokens', api, bid, key, cb);
			}
		}
	});
}
*/