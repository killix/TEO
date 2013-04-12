#!/bin/bash
mkdir -p titanium/tmp/
mkdir -p build/titanium/
cp deps/enet/lib/enet.js titanium/tmp/
cp deps/otr4-em/lib/*.js titanium/tmp/
cp deps/telehash/lib/v1/*.js titanium/tmp/
cp titanium/src/ti-libotr4.js titanium/tmp/libotr4.js
cp titanium/src/os-titanium.js titanium/tmp/os.js
node node-browserify/bin/cmd.js titanium/src/index.js \
               -i ti.udp \
               -i tiotrmodule \
               -r ./titanium/tmp/async.js:async \
               -r ./titanium/tmp/seedrandom.js:seedrandom.js \
               -r ./titanium/tmp/bigint.js:bigint.js \
               -r ./titanium/tmp/libotr4.js:libotr4.js \
               -r ./titanium/tmp/libotr-js-bindings.js:libotr-js-bindings.js \
               -r ./titanium/tmp/otr-module.js:otr \
               -r ./titanium/tmp/os.js:os \
               -r ./titanium/tmp/iputil.js:iputil \
               -r ./titanium/src/ti-dgram.js:dgram \
               -r ./titanium/tmp/enet.js:enet \
               -r ./titanium/tmp/udplib.js:udplib \
               -r ./titanium/tmp/hash.js:hash \
               -r ./titanium/tmp/switch.js:switch \
               -r ./titanium/tmp/telehash:telehash \
               -o build/titanium/teo-titanium.js

#copy the generated teo-titanium.js to the Resources/ directory of the
#titanium mobile app
