#!/bin/bash

set -eu

cd "$(dirname "$0")"
cd ../
PACKAGE_DIR=$PWD
BUILD_DIR=$PACKAGE_DIR/build/circuits
cd ../../
ROOT_DIR=$PWD
REPLACE_TARGET_FILE=$ROOT_DIR/node_modules/maci-circuits/build/index.js

# Need to overwrite zkutilPath variable due to mocha test
# check if build file exists
if [ ! -f $REPLACE_TARGET_FILE ]; then
    echo "$REPLACE_TARGET_FILE not exist. exiting..."
    exit
else
    cp $REPLACE_TARGET_FILE $REPLACE_TARGET_FILE.bk
fi

case "$OSTYPE" in
  darwin*)  arg="”" ;;
  linux*)   arg="" ;;
  *)        arg="" ;;
esac

sed -i $arg 's/maci_config_1.config.zkutil_bin/"~\/.cargo\/bin\/zkutil"/g' $REPLACE_TARGET_FILE

# check if build directory exists
if [ ! -e $BUILD_DIR ]; then
    mkdir -p $BUILD_DIR
fi

# build snarks
node $PACKAGE_DIR/build/buildSnarks.js
