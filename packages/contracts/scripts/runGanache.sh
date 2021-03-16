#!/bin/sh

set -e

# taken from maci https://github.com/barryWhiteHat/maci
#npx etherlime ganache --mnemonic "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat" --gasLimit=10000000 count=10
npx ganache-cli -m "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat" -l 15000000 -d 15000000 --allowUnlimitedContractSize

# Available Accounts
# ==================
# (0) 0x627306090abaB3A6e1400e9345bC60c78a8BEf57 (100 ETH)
# (1) 0xf17f52151EbEF6C7334FAD080c5704D77216b732 (100 ETH)
# (2) 0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef (100 ETH)
# (3) 0x821aEa9a577a9b44299B9c15c88cf3087F3b5544 (100 ETH)
# (4) 0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2 (100 ETH)
# (5) 0x2932b7A2355D6fecc4b5c0B6BD44cC31df247a2e (100 ETH)
# (6) 0x2191eF87E392377ec08E7c08Eb105Ef5448eCED5 (100 ETH)
# (7) 0x0F4F2Ac550A1b4e2280d04c21cEa7EBD822934b5 (100 ETH)
# (8) 0x6330A553Fc93768F612722BB8c2eC78aC90B3bbc (100 ETH)
# (9) 0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE (100 ETH)

# Private Keys
# ==================
# (0) 0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3
# (1) 0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f
# (2) 0x0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1
# (3) 0xc88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c
# (4) 0x388c684f0ba1ef5017716adb5d21a053ea8e90277d0868337519f97bede61418
# (5) 0x659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63
# (6) 0x82d052c865f5763aad42add438569276c00d3d88a2d062d36b2bae914d58b8c8
# (7) 0xaa3680d5d48a8283413f7a108367c7299ca73f553735860a87b08f39395618b7
# (8) 0x0f62d96d6675f32685bbdb8ac13cda7c23436f63efbb9d07700d8669ff12b7c4
# (9) 0x8d5366123cb560bb606379f90a0bfd4769eecc0557f1b362dcae9012b548b1e5
