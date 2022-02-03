import 'hardhat-deploy'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  DeployFunction,
  DeploymentsExtension,
  DeployOptions,
} from 'hardhat-deploy/types'

const { config } = require('@cream/config')

const _signUpDuration = config.maci.signUpDurationInSeconds
const _votingDuration = config.maci.votingDurationInSeconds

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const poseidon = await hre.ethers.getContract('Poseidon')
  const poseidonT3 = await hre.ethers.getContract('PoseidonT3')
  const poseidonT4 = await hre.ethers.getContract('PoseidonT4')
  const poseidonT5 = await hre.ethers.getContract('PoseidonT5')
  const poseidonT6 = await hre.ethers.getContract('PoseidonT6')
  const maciFactory = await hre.ethers.getContract('MACIFactory')

  const [deployer] = await hre.getUnnamedAccounts()

  const options: DeployOptions = {
    from: deployer,
    log: true,
    libraries: {
      Poseidon: poseidon.address,
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
    args: [maciFactory.address, _signUpDuration, _votingDuration],
  }
  await hre.deployments.deploy('CreamFactory', options)
}

export default func
