#!/bin/bash

set -eu

cd "$(dirname "$0")"

if [ -f ~/.cargo/bin/zkutil ]; then
    echo "zktuil already installed exiting..."
    exit
fi

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rust.sh
chmod a+x rust.sh
sh rust.sh -y
rm rust.sh
source $HOME/.cargo/env
cargo install zkutil --version 0.3.2
