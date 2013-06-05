/*

nodejs dgram API to chrome.socket UDP API
Copyright (C) 2013 Mokhtar Naamani

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


  http://nodejs.org/api/dgram.html
  http://developer.chrome.com/apps/socket.html
*/

var events = require('events');
var util = require('util');
var Buffer = require('buffer').Buffer;

var chrome_socket = chrome.socket || chrome.experimental.socket;
if(!chrome_socket){
    console.log("Warning: Browser missing chrome.socket API");
}

util.inherits(UDPSocket, events.EventEmitter);

module.exports.createSocket = function (type, message_event_callback){
    if(type!=='udp4' && type!=='udp6') throw('Invalid UDP socket type');
    return new UDPSocket(message_event_callback);
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
        chrome_socket.recvFrom(self.__socket_id, undefined, function(info){
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
    chrome_socket.destroy(self.__socket_id);
    clearInterval(self.__poll_interval);
    delete self.__poll_interval;
};

UDPSocket.prototype.bind = function(port,address){
    var self = this;
    address = address || "0.0.0.0";
    port = port || 0;
    if(self.__socket_id || self.__bound ) return;//only bind once!
    self.__bound = true;
    chrome_socket.create('udp',{},function(socketInfo){
        self.__socket_id = socketInfo.socketId;
        chrome_socket.bind(self.__socket_id,address,port,function(result){
            chrome_socket.getInfo(self.__socket_id,function(info){
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

UDPSocket.prototype.setBroadcast = function(flag){
    //do chrome udp sockets support broadcast?
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
    chrome_socket.sendTo(job.socket_id,data,job.address,job.port,function(result){
        var err;
        if(result.bytesWritten < data.byteLength ) err = 'truncation-error';
        if(result.bytesWritten < 0 ) err = 'send-error';
        if(job.callback) job.callback(err,result.bytesWritten);
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
