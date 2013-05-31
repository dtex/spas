var 
  connect = require('connect')
  , http = require('http')
;

var app = connect()
  .use(connect.session({ secret: 'My SECRET'}));