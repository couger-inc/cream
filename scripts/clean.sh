#!/bin/bash

set -eu

cd $(dirname $0)
cd ../
PROJECT_DIR=$PWD
echo $PROJECT_DIR
CREAM_DIR=$PROJECT_DIR

find . -name "node_modules" -type d -prune -exec rm -rf "{}" \;
echo "Cleaned node_modules"

find . -name "build" -type d -prune -exec rm -rf "{}" \;
echo "Cleaned build"

find . -name "dist" -type d -prune -exec rm -rf "{}" \;
echo "Cleaned dist"

find . -name "types" -type d -prune -exec rm -rf "{}" \;
echo "Cleaned types"

find . -name "migrations" -type d -prune -exec rm -rf "{}" \;
echo "Cleaned migrations"

find . -name ".cache" -type d -prune -exec rm -rf "{}" \;
echo "Cleaned cache"

if [ -e $CREAM_DIR/contracts/contracts/verifiers/CreamVerifier.sol ]; then
  rm $CREAM_DIR/contracts/contracts/verifiers/CreamVerifier.sol
  echo "Cleaned CreamVerifier.sol"
fi

echo "Cleaning finished!"
