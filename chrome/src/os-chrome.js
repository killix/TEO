var interfaces;



exports.networkInterfaces=function(){

    if(interfaces) return interfaces;

    interfaces = {};

    chrome.socket.getNetworkList(function(list){

        list.forEach(function(addr){

            if(!interfaces[addr.name]) interfaces[addr.name]=[];

            interfaces[addr.name].push({'address':addr.address,'family':'IPv4'});

        });

    });

    return interfaces;

}
