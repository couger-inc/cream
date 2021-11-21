#!/bin/bash

set -eu

npx lerna clean -y

cd $(dirname $0)
cd ../
PROJECT_DIR=$PWD
echo $PROJECT_DIR
CREAM_DIR=$PROJECT_DIR

for name in node_modules build dist types migrations .cache artifacts cache; do
  find . -name $name -type d -prune -exec rm -rf "{}" \;
  echo "Cleaned $name"
done

if [ -e $CREAM_DIR/packages/contracts/contracts/verifiers/CreamVerifier.sol ]; then
  rm $CREAM_DIR/packages/contracts/contracts/verifiers/CreamVerifier.sol
  echo "Cleaned CreamVerifier.sol"
fi

cd packages/outside-tester
npx lerna clean -y
npm lerna run clean

echo "Cleaning finished!"
