//nodejs dgram api from chrome.socket UDP api
//http://nodejs.org/api/dgram.html
//http://developer.chrome.com/apps/socket.html

var dgram = module.exports;

var events = require('events');
var util = require('util');
var Buffer = require('buffer').Buffer;

util.inherits(UDPSocket, events.EventEmitter);

dgram.createSocket = function (type, message_event_callback){
    if(type!=='udp4' && type!=='udp6') throw('Invalid UDP socket type');
    var socket = new UDPSocket(message_event_callback);
    return socket;
}

function UDPSocket(msg_evt_cb){
    events.EventEmitter.call(this);
    var self = this;

    self.on("listening",function(){
        //send pending datagrams..
        self.__pending.forEach(function(job){
            job.socket_id = self.__socket_id;
            send_datagram(job);            
        });
        delete self.__pending;
        //start polling socket for incoming datagrams
        self.__poll_interval = setInterval(do_recv,50);
        console.log("chrome socket bound to:",JSON.stringify(self.address()));
    });

    if(msg_evt_cb) self.on("message",msg_evt_cb);

    function do_recv(){
        if(!self.__socket_id) return;
        chrome.socket.recvFrom(self.__socket_id, undefined, function(info){
            var buff;
            //todo - set correct address family
            //todo - error detection.
            if(info.resultCode > 0){
                buff = arrayBuffer2Buffer(info.data);
                self.emit("message",buff,{address:info.address,port:info.port,size:info.data.byteLength,family:'IPv4'});
            }
        });
    }
    self.__pending = [];//queued datagrams to send (if app tried to send before socket is ready)
}
UDPSocket.prototype.close = function(){
    //Close the underlying socket and stop listening for data on it.
    if(!self.__socket_id) return;
    chrome.socket.destroy(self.__socket_id);
    clearInterval(self.__poll_interval);
    delete self.__poll_interval;
};

UDPSocket.prototype.bind = function(port,address){
    var self = this;
    address = address || "0.0.0.0";
    port = port || 0;
    if(self.__socket_id || self.__bound ) return;//only bind once!
    self.__bound = true;
    chrome.socket.create('udp',{},function(socketInfo){
        self.__socket_id = socketInfo.socketId;
        chrome.socket.bind(self.__socket_id,address,port,function(result){
            chrome.socket.getInfo(self.__socket_id,function(info){
              self.__local_address = info.localAddress;
              self.__local_port = info.localPort;
              self.emit("listening");
            });
        });
    });
};

UDPSocket.prototype.address = function(){
    return({address:this.__local_address,port:this.__local_port});
};

UDPSocket.prototype.send = function(buff, offset, length, port, address, callback){
    var self = this;
    var job = {
            socket_id:self.__socket_id,
            buff:buff,
            offset:offset,
            length:length,
            port:port,
            address:address,
            callback:callback
    };
    if(!self.__socket_id){
         if(!self.__bound) self.bind();
         self.__pending.push(job);
    }else{
        send_datagram(job);
    }

};

function send_datagram(job){
    var data;
    var buff;
    var i;
    if(job.offset == 0 && job.length == job.buff.length){ 
        buff = job.buff;
    }else{
        buff = job.buff.slice(job.offset,job.offset+job.length);
    }
    data = buffer2arrayBuffer(buff);
    chrome.socket.sendTo(job.socket_id,data,job.address,job.port,function(result){
        //result.bytesWritten bytes sent..
        if(job.callback) job.callback();
    });
}

function buffer2arrayBuffer(buffer){
  var arraybuffer = new ArrayBuffer(buffer.length);
  var uint8Array = new Uint8Array(arraybuffer);
  for(var i = 0; i < buffer.length; i++) {
    uint8Array[i] = buffer.readUInt8(i);//cannot index Buffer with [] if browserified..
  }
  return arraybuffer;
}

function arrayBuffer2Buffer(arrayBuffer){
  var buffer = new Buffer(arrayBuffer.byteLength);
  var uint8Array = new Uint8Array(arrayBuffer);
  for(var i = 0; i < uint8Array.byteLength; i++) {
    buffer.writeUInt8(uint8Array[i], i);
  }
  return buffer;
}
