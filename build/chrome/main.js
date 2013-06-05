var TEO = LOAD_BUNDLE(window);//load TEO bundle into global window object

var os = require("os");

TEO.on("loaded",function(){
    console.log(TEO);
    console.log("TEO Loaded.");
});
