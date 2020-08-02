#!/bin/bash

set -eu

cd "$(dirname "$0")"
cd ../
PROJECT_DIR=$PWD
BUILD_DIR=$PROJECT_DIR/build/circuits

# check if build directory exists
if [ ! -e $BUILD_DIR ]; then
  mkdir -p $BUILD_DIR
fi

# build snarks
node ./build/buildSnarks.js
