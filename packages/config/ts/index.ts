import * as path from 'path'

if (!process.env.hasOwnProperty('NODE_CONFIG_DIR')) {
  process.env.NODE_CONFIG_DIR = path.join(__dirname, '../')
}

if (!process.env.hasOwnProperty('NODE_ENV')) {
  process.env.NODE_ENV = 'test'
}

export interface Config {
  env: string,
  cream: {
    merkleTreeDepth: number,
    zeroValue: string,
  },
  maci: {
    initialVoiceCreditBalance: number,
    signUpDurationInSeconds: number,
    votingDurationInSeconds: number,
    coordinatorPrivKey: string,
    messageBatchSize: number,  // must be a multiple of 5
    merkleTrees: {
      intStateTreeDepth: number,  // used in tallying
      stateTreeDepth: 10,  // hardcoded value in MACI codebase
      ballotTreeDepth: 10,  // hardcoded value in MACI codebase
      messageTreeDepth: number,
      messageTreeSubDepth: number,
      voteOptionTreeDepth: number,
    },
  },
  chain: {
    privateKeysPath: string,
  },
  snarkParamsPath: string,
}

export const config: Config = require('config')
