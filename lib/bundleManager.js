var EventEmitter = require('events').EventEmitter
	, fs = require('fs')
	, _ = require('underscore')
	, winston = require('./logging').winston
	, engine = require('./engine')
	, util = require('util')
	, watch = require('watch')
	, uuid = require("node-uuid")
	, cronJob = require("cron").CronJob
;

// ### The bundles folder location depends on wether we are running spas globally or not
var bundlesFolder = GLOBAL.config.isLocal ? process.cwd() + '/bundles' : process.cwd();

// ### If the bundles folder is needed but doesn't exist, create it
if (GLOBAL.config.isLocal && !fs.existsSync(bundlesFolder)) fs.mkdirSync(bundlesFolder);

// ### adds endsWith if it is not present on String object
if (!String.prototype.endsWith) {
    Object.defineProperty(String.prototype, 'endsWith', {
        enumerable: false,
        configurable: false,
        writable: false,
        value: function (searchString, position) {
            position = position || this.length;
            position = position - searchString.length;
            return this.lastIndexOf(searchString) === position;
        }
    });
}

// ### Add a sample bundle
var addSampleBundle = function() {
	var sampleFile = bundlesFolder + '/sample.js';
	var sample = "var spashttp = require(\"spas-http\");\n\nexports.sample = {\n\t\"searchTweets\": {\n\t\t\"resource\": spashttp.request,\n\t\t\"params\": {\n\t\t\t\"url\": \"http://search.twitter.com/search.json\",\n\t\t\t\"q\": \"dtex\",\n\t\t\t\"lang\": \"en\",\n\t\t\t\"count\": 100 \n\t\t},\n\t\t\"cacheduration\": 3600,\n\t\t\"timeout\": 500,\n\t\t\"filter\": {\n\t\t\t\"results\": [{\n\t\t\t\t\"from_user\": true,\n\t\t\t\t\"text\": true }]\n\t\t}\n\t},\n\t\"searchMoreTweets\": {\n\t\t\"resource\": spashttp.request,\n\t\t\"params\": {\n\t\t\t\"url\": \"http://search.twitter.com/search.json\",\n\t\t\t\"q\":\"spas\",\n\t\t\t\"lang\": \"en\" \n\t\t},\n\t\t\"cacheduration\": 3600\n\t}\n}";
	fs.writeFileSync(sampleFile, sample);
}

// ## The BundleManager is responsible for loading and monitoring the bundles directory for changes
var BundleManager = function() {

    var self = this;
    
    // Either this is the first load or a bundle has been added, deleted or changed
    this.refreshBundles = function( targetFile, callback ) {
		
		winston.info('bundleManager refreshBundles');
	
		var bundles = {}
			, files = fs.readdirSync(bundlesFolder);
	
		_.each(files, function(file, idx) {
			
			// Make sure we ignore non-js files, dotfiles, packae.json and config.json
			if (file.indexOf('.js') !== -1 && file.indexOf('package.json') === -1 && file.indexOf('config.json') === -1 && (file[0] !== '.' || (targetFile && targetFile.indexOf(file) != -1 ))) {
				// if any part fo the bundle is not valid js an error will be thrown and we ignore the rest of the file
				try {
					var tempBundle =  require(bundlesFolder + "/" + file);
					_.each(tempBundle, function(part, key) {
						winston.info("Bundle \""+key+"\": loaded from \"" + file + "\"");
						bundles[key] = part;
						bundles[key].locked = false;
					});
				} catch(err) {
					winston.error("Error parsing bundle \""+file+"\": "+err);
				}
			}
			
		});
		
		GLOBAL.bundles = bundles;
		
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
		
		if (callback) callback();
		
	}
		
	// Watch the bundles directory for changes
	watch.createMonitor(bundlesFolder, { "ignoreDotFiles": true }, function (monitor) {
		
		monitor.on("created", function (file, stat) {
			if ( file.endsWith('.js') ) {
				winston.event('Bundle file created: ' + file);
				self.refreshBundles();
			}
		});
		
		monitor.on("changed", function (file, curr, prev) {
			if ( file.endsWith('.js') ) {
				winston.event('Bundle file changed: ' + file);
				
				// To bust node's module caching we rename the file before calling updateBundle
				var tempFile = '.'+uuid.v4();
				fs.renameSync(file, tempFile);
				self.refreshBundles(tempFile, function() {
					// Now we can change the bundle name back to its original name
					fs.renameSync(tempFile, file);
				});
			}
		});
		
		monitor.on("removed", function (file, stat) {
			if ( file.endsWith('.js') ) {
				winston.event('Bundle file removed: ' + file);
				self.refreshBundles();
			}
		});
		
	});
    
};

// If --create was passed from the commandline create sample.js bundle
if ( GLOBAL.config.args.create ) {
	addSampleBundle();
}
	
util.inherits(BundleManager, EventEmitter);

module.exports = BundleManager;
