(function(){
  var util = require("util");
  var events = require("events");

  function TeoObject(){
    events.EventEmitter.call(this);
  }
  util.inherits(TeoObject,events.EventEmitter);

  var TEO = new TeoObject();
  this.TEO = TEO;
  this.Buffer = require("buffer").Buffer;
  this.require = require; //export the require.js functionality 
  require("os").networkInterfaces(function(interfaces){
        //when interfaces are detected, TEO is ready to be used.
        TEO.telehash = require("telehash");
        TEO.enet = require("enet");
        TEO.otr = require("otr");
        TEO.emit("loaded");
  });
}).call();
