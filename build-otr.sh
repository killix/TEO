#!/bin/bash
	cd ./node-browserify
	git pull
	cd ../
	mkdir -p otr4-browserified/tmp/
	mkdir -p build/otr4-browserified/
	cp deps/otr4-em/lib/*.js otr4-browserified/tmp/
	cp otr4-browserified/src/exports.js otr4-browserified/tmp/
	node node-browserify/bin/cmd.js otr4-browserified/tmp/exports.js \
               -r ./otr4-browserified/tmp/async.js:async \
               -r ./otr4-browserified/tmp/bigint.js:bigint.js \
               -r ./otr4-browserified/tmp/libotr4.js:libotr4.js \
               -r ./otr4-browserified/tmp/libotr-js-bindings.js:libotr-js-bindings.js \
               -r ./otr4-browserified/tmp/otr-module.js:otr \
               -o ./build/otr4-browserified/otr.js
cp otr4-browserified/src/index.html ./build/otr4-browserified/
cp otr4-browserified/src/test.js ./build/otr4-browserified/
