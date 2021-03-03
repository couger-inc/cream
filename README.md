# C.R.E.A.M

[![Actions Status](https://github.com/couger-inc/cream/workflows/cream%20contract%20test/badge.svg)](https://github.com/couger-inc/cream/actions)

Confidential Reliable Ethereum Anonymous Mixer

## Requirement

* `node` >=v11.x <=v12.x

## Setup

### Config file
Check out [packages/config/test.yml](./packages/config/test.yml) file how to configure settings:

```yml
cream:
  merkleTrees: 4
  recipients: [
    "0x65A5B0f4eD2170Abe0158865E04C4FF24827c529",
    "0x9cc9C78eDA7c7940f968eF9D8A90653C47CD2a5e",
    "0xb97796F8497bb84C63e650E9527Be587F18c09f8"
  ]
  zeroValue: "2558267815324835836571784235309882327407732303445109280607932348234378166811"

maci:
  initialVoiceCreditBalance: 100
  signUpDurationInSeconds: 3600 # 1 hour
  votingDurationInSeconds: 3600 # 1 hour
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
$ yarn test
```

