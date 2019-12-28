#!/bin/bash

set -eu

CIRCUITS_DIR=circuits
BUILD_CIRCUITS_DIR=build/circuits
CONTRACTS_DIR=contracts

if [[ ! -e $BUILD_CIRCUITS_DIR ]]; then
  mkdir -p $BUILD_CIRCUITS_DIR
fi

if [[ ! -e $CONTRACTS_DIR ]]; then
  mkdir -p $CONTRACTS_DIR
fi

# circuit compile
# create output file: vote.json
npx circom $CIRCUITS_DIR/vote.circom -o $BUILD_CIRCUITS_DIR/vote.json &>/dev/null

# optional: showing cuicuit information
#npx snarkjs info -c $BUILD_CIRCUITS_DIR/vote.json

# setup with groth16
# create output files: vote_proving_key.json vote_verification_key.json
npx snarkjs setup --protocol groth -c $BUILD_CIRCUITS_DIR/vote.json --pk $BUILD_CIRCUITS_DIR/vote_proving_key.json --vk $BUILD_CIRCUITS_DIR/vote_verification_key.json

# build public key bin file
# create output file: vote_proving_key.bin
node node_modules/websnark/tools/buildpkey.js -i $BUILD_CIRCUITS_DIR/vote_proving_key.json -o $BUILD_CIRCUITS_DIR/vote_proving_key.bin

# generate verifier contract
# create output file: Verifier.sol
npx snarkjs generateverifier -v $CONTRACTS_DIR/Verifier.sol --vk $BUILD_CIRCUITS_DIR/vote_verification_key.json