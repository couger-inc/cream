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

for name in _js .sym .rics _cpp; do
  rm -rf packages/circuits/circom/test/*${name}
  echo "Cleaned zkp intermediate files"
done

for name in circuits contracts; do
  if [ -e packages/${name}/test-site ]; then
    rm -rf packages/${name}/test-site
    echo "Cleaned ${name} test-site"
  fi
done

echo "Cleaning finished!"
