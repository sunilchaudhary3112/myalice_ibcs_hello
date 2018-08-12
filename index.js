"use strict";

var app = require('./app.js');

//set parameters as appropriate
var port = 4001;
const config = {
    root: __dirname,
    port: port,
    logLevel: 'INFO',
    logger: null,
		basicAuth: null,
		sslOptions: null
};

console.log(config);
// Create an express app instance
var express_app = app.init(config);

// Start the server listening..
express_app.listen(port,()=>{
  console.log("Server running at port" + port);
});
