import 'hardhat-deploy'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  DeployFunction,
  DeploymentsExtension,
  DeployOptions,
} from 'hardhat-deploy/types'
const { config } = require('@cream/config')

const _intStateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const _messageTreeSubDepth = 2
const _messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
const _voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
const _signUpDuration = config.maci.signUpDurationInSeconds
const _votingDuration = config.maci.votingDurationInSeconds

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const name = 'MACIFactory'

  const t3 = await hre.ethers.getContract('PoseidonT3')
  const t4 = await hre.ethers.getContract('PoseidonT4')
  const t5 = await hre.ethers.getContract('PoseidonT5')
  const t6 = await hre.ethers.getContract('PoseidonT6')

  const [deployer] = await hre.getUnnamedAccounts()

  const options: DeployOptions = {
    from: deployer,
    log: true,
    libraries: {
      PoseidonT3: t3.address,
      PoseidonT4: t4.address,
      PoseidonT5: t5.address,
      PoseidonT6: t6.address,
    },
    args: [
      _intStateTreeDepth,
      _messageTreeSubDepth,
      _messageTreeDepth,
      _voteOptionTreeDepth,
      _signUpDuration,
      _votingDuration,
    ],
  }
  await hre.deployments.deploy(name, options)
}

export default func
