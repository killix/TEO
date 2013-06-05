var util = require("util");
var events = require("events");

function TeoObject(){
    events.EventEmitter.call(this);
}
util.inherits(TeoObject,events.EventEmitter);

//loads the bundle and inserts 
LOAD_BUNDLE = function(window){
    window.Buffer = require("buffer").Buffer;
    window.require = require;  //browserify's require exported to global object
    var TEO = new TeoObject();
    require("os").networkInterfaces(function(interfaces){
        //when interfaces are detected, TEO is ready to be used.
        TEO.telehash = require("telehash");
        TEO.enet = require("enet");
        TEO.otr = require("otr");
        TEO.emit("loaded");
    });
    return TEO;
};
