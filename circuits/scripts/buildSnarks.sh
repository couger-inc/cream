#!/bin/bash

set -eu

cd "$(dirname "$0")"
cd ../
PROJECT_DIR=$PWD
BUILD_DIR=$PROJECT_DIR/build/circuits
REPLACE_TARGET_FILE=$PROJECT_DIR/node_modules/maci-circuits/build/index.js

# Need to overwrite zkutilPath variable due to mocha test
# check if build file exists
if [ ! -f $REPLACE_TARGET_FILE ]; then
	echo "$REPLACE_TARGET_FILE not exist. exiting..."
	exit
else
	cp $REPLACE_TARGET_FILE $REPLACE_TARGET_FILE.bk
fi

sed -i ” 's/maci_config_1.config.zkutil_bin/"~\/.cargo\/bin\/zkutil"/g' $REPLACE_TARGET_FILE

# check if build directory exists
if [ ! -e $BUILD_DIR ]; then
  mkdir -p $BUILD_DIR
fi

# build snarks
node ./build/buildSnarks.js
