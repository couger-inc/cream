# C.R.E.A.M

[![Actions Status](https://github.com/couger-inc/cream/workflows/cream%20contract%20test/badge.svg)](https://github.com/couger-inc/cream/actions)

Confidential Reliable Ethereum Anonymous Mixer

## Requirement

* node v10.*

## Setup

### Config file
Check out [config/test.yml](./config/test.yml) file how to configure settings:

```yml
cream:
  merkleTrees: 4
  denomination: 1000000000000000000
  recipients: [
    "0x65A5B0f4eD2170Abe0158865E04C4FF24827c529",
    "0x9cc9C78eDA7c7940f968eF9D8A90653C47CD2a5e",
    "0xb97796F8497bb84C63e650E9527Be587F18c09f8"
  ]
  zeroValue: "2558267815324835836571784235309882327407732303445109280607932348234378166811"
```

### Circuit
Make sure you set the same value of merkleTrees depth on both [config/test.yml](./config/test.yml) and [circuits/circom.circom](./circuits/circom/vote.circom).

After finished setting, you can run:

```bash
$ npm run bootstrap && \
$ npm run build
$ ganache-cli // or cd contracts && npm run ganache
$ npm run migrate
```

## Test

```bash
# after finished setting:
$ npm run test
```

if you get an error after `npm run test`, such as `Error: Cannot find module 'worker_threads'`, please run following command.

```bash
$ export NODE_OPTIONS=--experimental-worker
```
