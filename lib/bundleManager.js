var EventEmitter = require('events').EventEmitter
	, fs = require('fs')
	, _ = require('underscore')
	, winston = require('./logging').winston
	, util = require('util')
	, watch = require('watch')
	, uuid = require("node-uuid")
	, path = require('path')
;

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

var bundlesFolder = process.cwd();

var BundleManager = function() {

    var self = this;
    
    this.refreshBundles = function( targetFile, callback ) {
		
		winston.info('bundleManager refreshBundles');
	
		var bundles = {}
			, files = fs.readdirSync(bundlesFolder);
	
		_.each(files, function(file, idx) {
			if (file.indexOf('.js') !== -1 && file.indexOf('config.json') === -1 && (file[0] !== '.' || (targetFile && targetFile.indexOf(file) != -1 ))) {
				try {
					var tempBundle =  require(bundlesFolder + "/" + file);;
					_.each(tempBundle, function(part, key) {
						winston.info("Bundle \""+file+"\": loaded");
						bundles[key] = part;
					});
				} catch(err) {
					winston.error("Error parsing bundle \""+file+"\": "+err);
				}
			}
			
		});
		
		self.emit('bundlesUpdated', bundles);
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
	
util.inherits(BundleManager, EventEmitter);

module.exports = BundleManager;
