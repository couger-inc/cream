import { Config } from './ts'
import defaultConfig from './default'

const config: Config = {
  ...defaultConfig,
  env: 'prod',

  cream: {
    ...defaultConfig.cream,
    merkleTreeDepth: 16,
  },

  maci: {
    ...defaultConfig.maci,
    signUpDurationInSeconds: 3600, // 1 hour
    votingDurationInSeconds: 3600, // 1 hour
  },
}

export default config
