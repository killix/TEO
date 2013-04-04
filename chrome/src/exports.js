var os = require("os");
os.networkInterfaces();

//called from the browser to import objects
IMPORT_BUNDLE = function(){
    this.Buffer = require("buffer").Buffer;
    this.require = require;  //browserify's require exported to global object
};

//TEO namespace
TEO = {};

TEO.telehash = require("telehash");
TEO.enet = require("enet");
TEO.otr = require("otr");
