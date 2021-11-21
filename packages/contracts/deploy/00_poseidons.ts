import 'hardhat-deploy'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import {
  DeployFunction,
  DeploymentsExtension,
  DeployOptions,
  ArtifactData,
} from 'hardhat-deploy/types'

const genContract = require('circomlib/src/poseidon_gencontract.js')

interface WithName {
  name: string
}

const genPoseidonABI = (name: string, numArgs: number) => {
  const abi: WithName[] = genContract.generateABI(numArgs)
  abi.forEach((x) => {
    x.name = name
  })
  return abi
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [deployer] = await hre.getUnnamedAccounts()

  // deploy Poseidon
  const contract: ArtifactData = {
    abi: genPoseidonABI('Poseidon', 2),
    bytecode: genContract.createCode(2),
  }
  const options: DeployOptions = {
    from: deployer,
    args: [],
    log: true,
    contract,
  }
  await hre.deployments.deploy('Poseidon', options)

  // deploy PoseidonT{2,3,4,5}
  for (const numArgs of [2, 3, 4, 5]) {
    const name = `PoseidonT${numArgs + 1}`
    const abi = genPoseidonABI(name, numArgs)
    const bytecode = genContract.createCode(numArgs)

    const contract: ArtifactData = {
      abi,
      bytecode,
    }
    const options: DeployOptions = {
      from: deployer,
      args: [],
      log: true,
      contract,
    }
    await hre.deployments.deploy(name, options)
  }
}

export default func
