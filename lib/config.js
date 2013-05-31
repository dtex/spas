// ## Dependencies.

var 
   nconf = require('nconf')
   , fs = require('fs')
;

var config,
	configFile = process.cwd() + '/config.json'
	, packageFile = process.cwd() + '/package.json';
	
nconf.argv();

var addDefaultConfig = function() {
	
	var defaultConfig = {
		"development": { "url": "http://localhost:3000", "port": 3000, "redis": { "port": 6379, "address": "localhost" } },
		"live": { "url": "http://localhost", "port": 80, "redis": { "port": 6379, "address": "localhost" } }
	}
	
	defaultConfig = JSON.stringify(defaultConfig, null, '\t');
	
	fs.writeFileSync(configFile, defaultConfig);
}

var addPackageJson = function() {
	var myPackage = {
		"description": "spas instance",
		"version": "0.0.0",
		"private": true,
		"dependencies": {
			"spas-http": "0.1.x",
			"spas-youtube": "0.1.x",
			"spas-flickr": "0.1.x",
			"spas-smugmug": "0.1.x",
			"underscore": "1.x.x"
		}
	}
	myPackage = JSON.stringify(myPackage, null, '\t');
	
	fs.writeFileSync(packageFile, myPackage);
}

// If --create was passed in the commandline, create config.json and package.json
if ( nconf.get ('create')) {
	// Find our config file and make sure it exists
	if ( fs.existsSync(packageFile) === false ) addPackageJson();
	if ( fs.existsSync(configFile) === false ) addDefaultConfig();
}

// Use nconf to grab commandline params and read config.json
nconf.file({ file: configFile });

// If --dev is passed use the development config section
config = (nconf.get('dev') ? nconf.get('development') : nconf.get('live'));
config.args = {
	'dev': nconf.get('dev') ? true : null,
	'create': nconf.get('create') ? true : null,
	'log': typeof nconf.get('log') === 'undefined' ? 'event' : nconf.get('log'),
	'service': nconf.get('service') ? true : false
};
GLOBAL.config = config;


exports.nconf = nconf;

