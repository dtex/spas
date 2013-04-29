var spasRequest = require("spas-request");

exports.sample = {
  "searchTweets": {
    "resource": spasRequest["request"],
    "params": {"url": "http://search.twitter.com/search.json", "q": "dtex", "lang": "en", "count": 100 },
    "cacheduration": 3600,
    "timeout": 500,
    "filter": {
      "results": [{
        "from_user": true,
        "text": true
      }]
    }
  },
  "searchMoreTweets": {
    "resource": spasRequest["request"],
    "params": {"url": "http://search.twitter.com/search.json", "q": "spas", "lang": "en" },
    "cacheduration": 3600,
    "cleanup": function(res) {
    	// res holds the filtered results 
    	// You can manipulate res in any way you want here
    	// just return your manipulated results
    	return res;
    }
  },
  "cleanup": function(res) {
	// res holds the filtered, concatenated bundle response
	// Here you can combine results objects and do all sorts of cools things
	// just return your manipulated bundle response
	return res;
  }
};