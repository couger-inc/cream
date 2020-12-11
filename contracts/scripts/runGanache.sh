#!/bin/sh

set -e

# taken from maci https://github.com/barryWhiteHat/maci
#npx etherlime ganache --mnemonic "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat" --gasLimit=10000000 count=10
npx ganache-cli -m "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat" -l 10000000 -d 10000000 --allowUnlimitedContractSize
