#!/bin/bash

set -eu

cd "$(dirname "$0")"
cd ../
PACKAGE_DIR=$PWD
BUILD_DIR=$PACKAGE_DIR/build/circuits
cd ../../

# check if build directory exists
if [ ! -e $BUILD_DIR ]; then
    mkdir -p $BUILD_DIR
fi

# build snarks
node $PACKAGE_DIR/build/buildSnarks.js
