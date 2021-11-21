import { Config } from './ts'
import defaultConfig from './default'

const config: Config = {
  ...defaultConfig,
  env: 'test',
}

export default config
