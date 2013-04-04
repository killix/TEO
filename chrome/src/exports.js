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

/*
var enet = require("enet");
TEO.enet = {
    Address:enet.Address,
    Host:enet.Host,
    Packet:enet.Packet,
};


var otr = require("otr");
TEO.otr = {
    MSGEVENT:otr.MSGEVENT,
    POLICY:otr.POLICY,
    ConnContext:otr.ConnContext,
    Session:otr.Session,
    User:otr.User,
    VFS:otr.VFS,
    version:otr.version,
    debugOn:otr.debugOn,
    debugOff:otr.debugOff    
};
*/
