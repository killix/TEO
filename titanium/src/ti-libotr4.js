
var otrModule = ti_require('tiotrmodule');
var BigInt = require('./bigint');

var OtrlConnContext;
var OpsEvent;

var _static_buffer_ptr = otrModule.CallMalloc(4096);
var _static_new_mpi_ptr_ptr = otrModule.CallMalloc(4);

otrModule.setup_ops_callback(function(){
    var evname = arguments[0];
    var opdata = arguments[1];
    var ctx;
    switch (evname){
        case 'policy': return OpsEvent(opdata,{},evname);

        case 'create_privkey':
            return OpsEvent(opdata,{
                "accountname": arguments[2],
                "protocol": arguments[3]
            },evname);

        case 'is_logged_in': return OpsEvent(opdata,{},evname);

        case 'inject_message': return OpsEvent(opdata,{
                "message": arguments[5]
            },evname);

        case  'update_context_list': return OpsEvent(opdata,{},evname);

        case  'fingerprint': return OpsEvent(opdata,{fingerprint:arguments[6]},evname);

        case  'write_fingerprints': return OpsEvent(opdata,{},evname);

        case  'gone_secure': return OpsEvent(opdata,{},evname);

        case  'still_secure': return OpsEvent(opdata,{
                "is_reply":arguments[3]
            },evname);

        case  'gone_insecure': return OpsEvent(opdata,{},evname);

        case  'max_message_size': return OpsEvent(opdata,{},evname);

        case  'received_symkey': return OpsEvent(opdata,{
                "use": arguments[3],
                "usedata":ptr_to_ArrayBuffer(arguments[4],arguments[5]),
                "key":ptr_to_ArrayBuffer(arguments[6],32)
            },evname);

        case  'msg_event': return OpsEvent(opdata,{
                "event":arguments[2],
                "message":arguments[4],
                "err": (arguments[5]? new GcryptError(arguments[5]):null)
            },evname);

        case  'create_instag': return OpsEvent(opdata,{
                "accountname": arguments[2],
                "protocol": arguments[3]
            },evname);

        case  'smp_request': 
            ctx = new OtrlConnContext(arguments[2]);
            if(arguments[3]!=0) ctx["question"] = arguments[3];
            return OpsEvent(opdata,ctx,evname);
        case  'smp_failed': 
        case  'smp_aborted':
        case  'smp_complete':
        case  'smp_error':
                ctx = new OtrlConnContext(arguments[2]);
                return OpsEvent(opdata,{},evname);

    }
});

var libotr4js = module.exports = {
  getModule : function(){
        return libotr4js;
  },
  init: function(F){
        OtrlConnContext = F.OtrlConnContext;
        OpsEvent = F.OpsEvent;
  },
  malloc      : function(){return otrModule.CallMalloc.apply(otrModule,arguments);},
  free        : function(){return otrModule.CallFree.apply(otrModule,arguments);},
  getValue    : getValue,
  setValue    : setValue,
  Pointer_stringify : function(){return otrModule.CallStringify.apply(otrModule,arguments);},

  helper: {
    mpi2bigint : mpi2bigint,
    bigint2mpi : bigint2mpi,
    ptr_to_ArrayBuffer : ptr_to_ArrayBuffer,
    ptr_to_HexString : ptr_to_HexString,
    unsigned_char : unsigned_char,
    unsigned_int32 : unsigned_int32,
    str2ab :    str2ab,
    ab2str : ab2str
  },
  libotrl:{
    version : function(){return otrModule.CallOtrlVersion.apply(otrModule,arguments);},
    userstate_create : function(){return otrModule.CallOtrlUserstateCreate.apply(otrModule,arguments);},
    userstate_free : function(){return otrModule.CallOtrlUserstateFree.apply(otrModule,arguments);},
    privkey_read : function(){return otrModule.CallOtrlPrivkeyRead.apply(otrModule,arguments);},
    privkey_fingerprint: function(){return otrModule.CallOtrlPrivkeyFingerprint.apply(otrModule,arguments);},
    privkey_generate: function(){return otrModule.CallOtrlPrivkeyGenerate.apply(otrModule,arguments);},
    privkey_read_fingerprints : function(){return otrModule.CallOtrlPrivkeyReadFingerprints.apply(otrModule,arguments);},
    privkey_write_fingerprints : function(){return otrModule.CallOtrlPrivkeyWriteFingerprints.apply(otrModule,arguments);},
    privkey_forget : function(){return otrModule.CallOtrlPrivkeyForget.apply(otrModule,arguments);},
    privkey_forget_all : function(){return otrModule.CallOtrlPrivkeyForgetAll.apply(otrModule,arguments);},
    privkey_find : function(){return otrModule.CallOtrlPrivkeyFind.apply(otrModule,arguments);},
    context_find : function(){return otrModule.CallOtrlContextFind.apply(otrModule,arguments);},
    message_sending : function(){return otrModule.CallOtrlMessageSending.apply(otrModule,arguments);},
    message_receiving : function(){return otrModule.CallOtrlMessageReceiving.apply(otrModule,arguments);},
    message_free : function(){return otrModule.CallOtrlMessageFree.apply(otrModule,arguments);},
    message_disconnect : function(){return otrModule.CallOtrlMessageDisconnect.apply(otrModule,arguments);},
    message_disconnect_all_instances : function(){return otrModule.CallOtrlMessageDisconnectAllInstances.apply(otrModule,arguments);},
    message_initiate_smp : function(){return otrModule.CallOtrlMessageInitiateSmp.apply(otrModule,arguments);},
    message_initiate_smp_q :function(){return otrModule.CallOtrlMessageInitiateSmpQ.apply(otrModule,arguments);},
    message_respond_smp : function(){return otrModule.CallOtrlMessageRespondSmp.apply(otrModule,arguments);},
    message_abort_smp : function(){return otrModule.CallOtrlMessageAbortSmp.apply(otrModule,arguments);},
    message_symkey : function(){return otrModule.CallOtrlMessageSymkey.apply(otrModule,arguments);},
    message_poll_get_default_interval : function(){return otrModule.CallOtrlMessagePollGetDefaultInterval.apply(otrModule,arguments);},
    message_poll : function(){return otrModule.CallOtrlMessagePoll.apply(otrModule,arguments);},

    instag_find : function(){return otrModule.CallOtrlInstagFind.apply(otrModule,arguments);},
    instag_read : function(){return otrModule.CallOtrlInstagRead.apply(otrModule,arguments);},
    instag_write: function(){return otrModule.CallOtrlInstagWrite.apply(otrModule,arguments);},
    instag_generate : function(){return otrModule.CallOtrlInstagGenerate.apply(otrModule,arguments);},
    tlv_free : function(){return otrModule.CallOtrlTlvFree.apply(otrModule,arguments);},
    tlv_find : function(){return otrModule.CallOtrlTlvFind.apply(otrModule,arguments);}    
  },

  libgcrypt:{
        strerror : function(){return otrModule.CallGcryStrerror.apply(otrModule,arguments);},
        mpi_new: function(){return otrModule.CallGcryMpiNew.apply(otrModule,arguments);},
        mpi_set: function(){return otrModule.CallGcryMpiSet.apply(otrModule,arguments);},
        mpi_release: function(){return otrModule.CallGcryMpiRelease.apply(otrModule,arguments);},
        mpi_print: function(){return otrModule.CallGcryMpiPrint.apply(otrModule,arguments);},
        mpi_scan: function(){return otrModule.CallGcryMpiScan.apply(otrModule,arguments);}
  },
    
  jsapi:{
    userstate_get_privkey_root : function(){return otrModule.CallJsapiUserstateGetPrivkeyRoot.apply(otrModule,arguments);},
    userstate_get_privkey_next : function(){return otrModule.CallJsapiUserstateGetPrivkeyNext.apply(otrModule,arguments);},
    userstate_get_privkey_accountname: function(){return otrModule.CallJsapiUserstateGetPrivkeyAccountname.apply(otrModule,arguments);},
    userstate_get_privkey_accountname: function(){return otrModule.CallJsapiPrivkeyGetProtocol.apply(otrModule,arguments);},
    privkey_write_trusted_fingerprints: function(){return otrModule.CallJsapiPrivkeyWriteTrustedFingerprints.apply(otrModule,arguments);},
    userstate_write_to_file : function(){return otrModule.CallJsapiUserstateWriteToFile.apply(otrModule,arguments);},
    privkey_delete: function(){return otrModule.CallJsapiPrivkeyDelete.apply(otrModule,arguments);},
    privkey_get_dsa_token: function(){return otrModule.CallJsapiPrivkeyGetDsaToken.apply(otrModule,arguments);},
    userstate_import_privkey: function(){return otrModule.CallJsapiUserstateImportPrivkey.apply(otrModule,arguments);},
    conncontext_get_protocol: function(){return otrModule.CallJsapiConncontextGetProtocol.apply(otrModule,arguments);},
    conncontext_get_username: function(){return otrModule.CallJsapiConncontextGetUsername.apply(otrModule,arguments);},
    conncontext_get_accountname: function(){return otrModule.CallJsapiConncontextGetAccountname.apply(otrModule,arguments);},
    conncontext_get_msgstate: function(){return otrModule.CallJsapiConncontextGetMsgstate.apply(otrModule,arguments);},
    conncontext_get_protocol_version: function(){return otrModule.CallJsapiConncontextGetProtocolVersion.apply(otrModule,arguments);},
    conncontext_get_sm_prog_state: function(){return otrModule.CallJsapiConncontextGetSmProgState.apply(otrModule,arguments);},
    conncontext_get_active_fingerprint: function(){return otrModule.CallJsapiConncontextGetActiveFingerprint.apply(otrModule,arguments);},
    conncontext_get_trust: function(){return otrModule.CallJsapiConncontextGetTrust.apply(otrModule,arguments);},
    conncontext_get_their_instance: function(){return otrModule.CallJsapiConncontextGetTheirInstance.apply(otrModule,arguments);},
    conncontext_get_our_instance: function(){return otrModule.CallJsapiConncontextGetOurInstance.apply(otrModule,arguments);},
    conncontext_get_master: function(){return otrModule.CallJsapiConncontextGetMaster.apply(otrModule,arguments);},
    instag_get_tag: function(){return otrModule.CallJsapiInstagGetTag.apply(otrModule,arguments);},
    can_start_smp: function(){return otrModule.CallJsapiCanStartSmp.apply(otrModule,arguments);},
    messageappops_new : function(){return otrModule.CallJsapiMessageappopsNew.apply(otrModule,arguments);},
    initialise:function(){}
  }
}

function getValue(ptr,type){
        switch (type){
            case 'i8':  return otrModule.DoGetValueInt8(ptr);
            case 'i16': return otrModule.CallGetValueInt16(ptr);
            case 'i32': return otrModule.CallGetValueInt32(ptr);
        }
}

function setValue(ptr,value,type){
        switch(type){
            case 'i8': otrModule.DoSetValueInt8(ptr,value);return;
            case 'i16':otrModule.DoSetValueInt16(ptr,value);return;
            case 'i32':otrModule.DoSetValueInt32(ptr,value);return;
        }
}

var gcry_ = libotr4js.libgcrypt;
    
function mpi2bigint(mpi_ptr){
    var GCRYMPI_FMT_HEX = 4; 
    var err = gcry_.mpi_print(GCRYMPI_FMT_HEX,_static_buffer_ptr,4096,0,mpi_ptr);

    if(err) {
        throw new GcryptError(err);
    }
    var mpi_str_ptr = _static_buffer_ptr;
    var mpi_str = otrModule.CallStringify(mpi_str_ptr);

    return BigInt.str2bigInt(mpi_str,16);
}

function bigint2mpi(mpi_ptr,bi_num){
    var new_mpi_ptr_ptr = _static_new_mpi_ptr_ptr;
    var bi_num_str = BigInt.bigInt2str(bi_num,16);
    var err = gcry_.mpi_scan(new_mpi_ptr_ptr,4,bi_num_str,0,0);
    if(err){
        throw new GcryptError(err);
    }
    var scanned_mpi_ptr = getValue(new_mpi_ptr_ptr,"i32");
    if(scanned_mpi_ptr==0){
        throw("NULL scanned MPI in __bigint2mpi() otr_pre.js");
    }
    var same = gcry_.mpi_set(mpi_ptr,scanned_mpi_ptr);

    gcry_.mpi_release(scanned_mpi_ptr);
    if(same && same != mpi_ptr){
        return same;
    }        
}

function GcryptError( num ) {
    this.num = num || 0;
    this.message = gcry_.strerror(num || 0);
}

GcryptError.prototype = new Error();
GcryptError.prototype.constructor = GcryptError;

var hexDigit = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

function hexString( val ){
    return hexDigit[(val & 0xF0) >> 4] + hexDigit[val & 0x0F];
}

function ptr_to_HexString(ptr,len){     
    var hex = "";
    for(var i=0; i<len; i++){
        hex = hex + hexString( unsigned_char( getValue( ptr + i,"i8")));
    }
    return hex;
}

function ptr_to_ArrayBuffer(ptr,len){
    var buf = new ArrayBuffer(len);
    var u8 = new Uint8Array(buf);
    for(var i=0; i<len; i++){
        u8[i]= unsigned_char( getValue( ptr + i,"i8"));
    }
    return buf;    
}

function unsigned_char( c ){
    c = c & 0xFF;
    return ( c < 0 ? (0xFF+1)+c : c );
} 

function unsigned_int32( i ){
    //i must be in the range of a signed 32-bit integer!
    i = i & 0xFFFFFFFF;//truncate so we don't return values larger than an unsigned 32-bit integer
    return ( i < 0 ? (0xFFFFFFFF+1)+i : i );
}

// http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
function ab2str(buf) {
  var u16 = new Uint16Array(buf);
  return String.fromCharCode.apply(null, u16);
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}
