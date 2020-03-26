#!/bin/bash

set -eu

cd $(dirname $0)
cd ../
PROJECT_DIR=$PWD

if [[ ! -f $PROJECT_DIR/config/*.json ]]; then
  if [[ ! -d $PROJECT_DIR/config ]]; then
    mkdir config
  fi
  if [[ ! -d $PROJECT_DIR/contracts/config ]]; then
    mkdir contracts/config
  fi
  cat <<EOF > $PROJECT_DIR/config/default.json
{
  "MERKLE_TREE_HEIGHT": 1,
  "DENOMINATION": "100000000000000000",
  "RECIPIENTS": [
    "0x65A5B0f4eD2170Abe0158865E04C4FF24827c529",
    "0x9cc9C78eDA7c7940f968eF9D8A90653C47CD2a5e",
    "0xb97796F8497bb84C63e650E9527Be587F18c09f8"
  ],
  "ZERO_VALUE": "2558267815324835836571784235309882327407732303445109280607932348234378166811"
}
EOF
  cp $PROJECT_DIR/config/default.json $PROJECT_DIR/contracts/config
fi
