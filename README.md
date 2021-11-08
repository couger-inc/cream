# zkC.R.E.A.M

[![Actions Status](https://github.com/couger-inc/cream/workflows/cream%20contract%20test/badge.svg)](https://github.com/couger-inc/cream/actions)

Zero-Knowledge Confidential Reliable Ethereum Anonymous Mixer

## Requirement

* `node` >=v11.x

## Setup

### Config file
Check out [packages/config/test.yml](./packages/config/test.yml) file how to configure settings:

```yml
cream:
  merkleTrees: 4
  zeroValue: "2558267815324835836571784235309882327407732303445109280607932348234378166811"

maci:
  initialVoiceCreditBalance: 100
  signUpDurationInSeconds: 180 # 3 min
  votingDurationInSeconds: 120 # 2 min
  coordinatorPrivKey: "2222222222263902553431241761119057960280734584214105336279476766401963593688"
  tallyBatchsize: 4
  messageBatchSize: 4
  quadVoteTallyBatchSize: 4
  voteOptionsMaxLeafIndex: 3

  merkleTrees:
    stateTreeDepth: 4
    messageTreeDepth: 4
    voteOptionTreeDepth: 2

chain:
  privateKeysPath: './'

snarkParamsPath: '../params'
```

### Circuit
Make sure you set the same value of merkleTrees depth on both [packages/config/test.yml](./packages/config/test.yml) and [packages/circuits/circom.circom](./packages/circuits/circom/vote.circom).

After finished setting, you can run:

```bash

$ yarn
$ yarn bulid
$ yarn ganache-cli // or cd packages/contracts && yarn ganache

# In up another terminal
$ cd packages/contracts && yarn migrate
```

## Test

```bash
# after finished setting:
$ docker-compose -f docker/docker-compose.yml up -d # run ipfs container
$ yarn test

# after finished test:
$ docker-compose -f docker/docker-compose.yml down
```
