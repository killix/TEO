var interfaces;

exports.networkInterfaces=function(callback){
    if(interfaces) {
        if(callback) callback(interfaces);
        return interfaces;
    }
    
    //getNetworkList in chrome is Async!
    chrome.socket.getNetworkList(function(list){
        interfaces = {};        
        list.forEach(function(addr){
            if(!interfaces[addr.name]) interfaces[addr.name]=[];
            interfaces[addr.name].push({'address':addr.address,'family':'IPv4'});
        });
        if(callback) callback(interfaces);
    });
}
