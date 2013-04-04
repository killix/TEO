#!/bin/bash
	mkdir -p chrome/tmp/
	mkdir -p build/chrome/
	cp deps/otr4-em/lib/*.js chrome/tmp/
	cp deps/otr4-em/lib/libotr4-chrome.js chrome/tmp/libotr4.js
	cp deps/enet/lib/enet.js chrome/tmp/
	cp deps/telehash/lib/v1/*.js chrome/tmp/
	cp chrome/src/dgram-chrome.js chrome/tmp/
	cp chrome/src/exports.js chrome/tmp/
	cp chrome/src/os-chrome.js chrome/tmp/os.js
	node node-browserify/bin/cmd.js chrome/tmp/exports.js \
               -r ./chrome/tmp/dgram-chrome.js:dgram \
               -r ./chrome/tmp/enet.js:enet \
               -r ./chrome/tmp/async.js:async \
               -r ./chrome/tmp/seedrandom.js:seedrandom.js \
               -r ./chrome/tmp/bigint.js:bigint.js \
               -r ./chrome/tmp/libotr4.js:libotr4.js \
               -r ./chrome/tmp/libotr-js-bindings.js:libotr-js-bindings.js \
               -r ./chrome/tmp/otr-module.js:otr \
               -r ./chrome/tmp/os.js:os \
               -r ./chrome/tmp/iputil.js:iputil \
               -r ./chrome/tmp/udplib.js:udplib \
               -r ./chrome/tmp/hash.js:hash \
               -r ./chrome/tmp/switch.js:switch \
               -r ./chrome/tmp/telehash:telehash \
               -o ./build/chrome/teo-chrome.js
	cp chrome/src/window.html build/chrome/
	cp chrome/src/icon.png build/chrome/
	cp chrome/src/manifest.json build/chrome/
	cp chrome/src/background.js build/chrome/
	cp chrome/src/main.js build/chrome/
