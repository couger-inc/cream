import { Config } from './ts'

const config: Config = {
  env: 'default',

  cream: {
    merkleTreeDepth: 4,
    zeroValue:
      '2558267815324835836571784235309882327407732303445109280607932348234378166811',
  },

  maci: {
    initialVoiceCreditBalance: 100,
    signUpDurationInSeconds: 180, // 3 min
    votingDurationInSeconds: 180, //  3 min
    coordinatorPrivKey:
      '2222222222263902553431241761119057960280734584214105336279476766401963593688',
    messageBatchSize: 5,   // has to be a multiple of 5

    merkleTrees: {
      intStateTreeDepth: 1,
      stateTreeDepth: 10,
      ballotTreeDepth: 10,
      messageTreeDepth: 2,
      messageTreeSubDepth: 1,
      voteOptionTreeDepth: 2,
    },
  },

  chain: {
    privateKeysPath: './',
  },

  snarkParamsPath: '../params',
}

export default config
