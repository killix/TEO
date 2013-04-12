var udp = ti_require("ti.udp");
var sock = udp.createSocket();

exports.networkInterfaces=function(){
    var address = sock.getLocalIPv4Address();
    
    if(address==""){
    	return undefined;
    }
    
    if(address=="127.0.0.1"){
    	return ({
		  'lo':[{'address':'127.0.0.1', 'family':'IPv4'}]          
    	});    	
    }
    
   	return ({
	  'lo':[{'address':'127.0.0.1', 'family':'IPv4'}],
	  'eth0':[{'address':address, 'family':'IPv4'}]
   	});    	
}
