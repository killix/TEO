var iputil = require('iputil');
//var Buffer = require("buffer").Buffer;
var events = require("events");
var util = require("util");

var UDP = ti_require('ti.udp');

util.inherits(DGram, events.EventEmitter);

exports.createSocket =function(type, incoming){
	return new DGram(incoming);
};

function DGram(incoming){
	var self = this;
    events.EventEmitter.call(this);

	this.socket = UDP.createSocket();
	this.socket.addEventListener('data', function(evt){
		//console.log(JSON.stringify(evt));
		//console.log("INCOMING PACKET:"+new Buffer(evt.bytesData).toString());
		//console.log("INCOMING PACKET LENGTH:"+evt.bytesData.length);
		incoming(
            new Buffer(evt.bytesData),
			{address:iputil.IP(evt.address.substr(1)), port:iputil.PORT(evt.address.substr(1))}
			//{address:iputil.IP(evt.address), port:iputil.PORT(evt.address)}
		);
	});
	this.socket.addEventListener('error', function (evt) {
    	console.log(JSON.stringify(evt));
        self.emit("error");
	});
	this.socket.addEventListener('started',function(evt){
		self._port = this.socketPort();
		self._address = this.getLocalIPv4Address();
        self.emit("listening");
	});
	return self;
};

DGram.prototype.bind = function(port, ip){
    this._port = port || 0;
	this.socket.start({
		port:this._port
	});
};

DGram.prototype.close = function(){
	this.socket.stop();
};

DGram.prototype.send = function (buff, offset, length, port, ip) {
//    console.log("about to send on dgram");
//    console.log(JSON.stringify(buff));
	this.socket.sendBytes({
		host:ip,
		port:port,
		data:buffer2Array(buff)
	});
};

DGram.prototype.address = function(){	
    return({
        port:this._port,
        address:this._address
    });
};

function buffer2Array(buff){
    var arr,i;
    if(buff.readUInt8){
        arr = new Array(buff.length);
        for(i=0;i<buff.length;i++){
            arr[i]=buff.readUInt8(i);
        }
    }else{
        arr = buff;
    }
    return arr;
}
