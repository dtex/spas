/*
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
*/

var 
	Logger = require('bunyan')
;
  
/*
	Configure Bunyan logging
*/
var streams = [], level = GLOBAL.config.args.log;
switch (level) {
  case "error":
  case "warn":
  case "info":
  case "debug":
    break;
  case "event":
    level = "info";
    break;
  case "verbose":
    level = "debug";
    break;
  case "data":
    // @TODO: Which level do we set to?
    break;
  case "input":
    // @TODO: Which level do we set to?
    break;
}

if (GLOBAL.config.args.spawned) {
  // If we are running as a service then output to DailyRotateFile
  streams.push({
    type: 'rotating-file',
    path: process.cwd() + '/logs/spasout.log',
    period: '1d',   // daily rotation
    count: 3,        // keep 3 back copies
    level: level
  });

} else {
  // otherwise output straight to the console
  streams.push({
    type: 'stream',
    stream: process.stdout,
    level: level
  });
}

var logger = Logger.createLogger({
  name: 'SPAS',
  streams: streams
});

Logger.prototype.event = function() {
  this.debug.apply(this, arguments);
};

// Backward compatibility
//logger.event = logger.debug;

exports.log = logger;