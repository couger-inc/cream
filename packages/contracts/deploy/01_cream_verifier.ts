import 'hardhat-deploy'
import {
  DeployFunction,
  DeploymentsExtension,
  DeployOptions,
} from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const name = 'CreamVerifier'
  const [deployer] = await hre.getUnnamedAccounts()

  const options: DeployOptions = {
    from: deployer,
    args: [],
    log: true,
  }
  await hre.deployments.deploy(name, options)
}

export default func
