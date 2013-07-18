var redis = require("redis")
  , redisRStream = require('redis-rstream')
  , zlib = require('zlib')
  , winston = require('./logging').winston
;

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
// ## The cached bundle is current so respond in the most efficient way possible
//
exports.response = function( bid, gzip, myRes, callback ) {
	 
	 winston.info('streaming.response: ' + bid);
	 
	 var responseType = callback ? 'application/javascript' : 'application/json';
	 
	 var responseHeaders = {'Content-Type': responseType, 'vary': 'Accept-Encoding'};//, 'max-age': jDoc.secleft, 'cache-control': 'public, max-age='+jDoc.secleft+', no-transform', "Expires": jDoc.expires, "Last-Modified": jDoc.lastModified};
	 
	 //myRes.writeHead(200, responseHeaders);
	 redisRStream(client, 'bid'+bid).pipe(myRes);
	 //myRes.end();
}