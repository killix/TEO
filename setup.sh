#!/bin/bash
#setup a local copy of browserify to use old version 1 with changes to work with emscripten
git clone https://github.com/mnaamani/node-browserify.git
cd node-browserify
git checkout v1-emscripten
npm install
cd ..
