import 'hardhat-deploy'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  DeployFunction,
  DeploymentsExtension,
  DeployOptions,
} from 'hardhat-deploy/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  for (const name of ['VotingToken', 'SignUpToken']) {
    const [deployer] = await hre.getUnnamedAccounts()

    const options: DeployOptions = {
      from: deployer,
      args: [],
      log: true,
    }
    await hre.deployments.deploy(name, options)
  }
}

export default func
