// ## Dependencies.

var 
   nconf = require('nconf')
   , path = require('path')
   , fs = require('fs')
;

var configFile = process.cwd() + '/config.json';

var addDefaultConfig = function() {
	
	var defaultConfig = {
		"development": { "url": "http://localhost:3000", "port": 3000, "redis": { "port": 6379, "address": "localhost" } },
		"live": { "url": "http://localhost", "port": 80, "redis": { "port": 6379, "address": "localhost" } }
	}
	
	defaultConfig = JSON.stringify(defaultConfig, null, '\t');
	
	fs.writeFileSync(configFile, defaultConfig);
}

var addSampleBundle = function() {

	var sampleFile = process.cwd() + '/sample.js';
	var sample = "var spashttp = require(\"spas-http\");\n\nexports.sample = {\n\t\"searchTweets\": {\n\t\t\"resource\": spashttp.request,\n\t\t\"params\": {\n\t\t\t\"url\": \"http://search.twitter.com/search.json\",\n\t\t\t\"q\": \"dtex\",\n\t\t\t\"lang\": \"en\",\n\t\t\t\"count\": 100 \n\t\t},\n\t\t\"cacheduration\": 3600,\n\t\t\"timeout\": 500,\n\t\t\"filter\": {\n\t\t\t\"results\": [{\n\t\t\t\t\"from_user\": true,\n\t\t\t\t\"text\": true }]\n\t\t}\n\t},\n\t\"searchMoreTweets\": {\n\t\t\"resource\": spashttp.request,\n\t\t\"params\": {\n\t\t\t\"url\": \"http://search.twitter.com/search.json\",\n\t\t\t\"q\":\"spas\",\n\t\t\t\"lang\": \"en\" \n\t\t},\n\t\t\"cacheduration\": 3600\n\t}\n}";
	fs.writeFileSync(sampleFile, sample);
}

var addPackageJson = function() {
	var packageFile = process.cwd() + '/package.json';
	var myPackage = "{\n\t\"description\": \"spas instance\",\n\t\"version\": \"0.0.0\",\n\t\"private\": true, \n\t\"dependencies\": {\n\t\t\"spas-youtube\": \"0.1.x\",\n\t\t\"spas-flickr\": \"0.1.x\",\n\t\t\"spas-smugmug\": \"0.1.x\",\n\t\t\"spas-http\": \"0.1.x\",\n\t\t\"underscore\": \"1.x.x\"\n\t}\n}";
	fs.writeFileSync(packageFile, myPackage);
}

// Find our config file and make sure it exists
if ( fs.existsSync(configFile) === false ) addDefaultConfig();

// Use nconf to grab commandline params and read config.json
nconf.argv().file({ file: configFile });

// If --create was passed in the commandline, create sample.js and package.json
if ( nconf.get ('create')) {
	addSampleBundle();
	addPackageJson();
}

// If --dev is passed use the development config section
exports.config = (nconf.get('dev') ? nconf.get('development') : nconf.get('live'));

exports.nconf = nconf;

