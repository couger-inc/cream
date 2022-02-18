// @ts-ignore
//const { ethers } = require('hardhat')

import * as fs from 'fs'
import {writeJSONFile} from 'maci-common'
import {contractFilepath, contractFilepathOld} from './config'

import {
    deployVkRegistry as deployVkRegistryContract,
} from 'maci-contracts'

const configureSubparser = (subparsers: any) => {
    subparsers.addParser(
        'deployVkRegistry',
        { addHelp: true },
    )
}

// we assume deployVkRegister is the start of a new set of MACI contracts
const deployVkRegistry = async (args: any) => {
    args; // to suppress never read error
    const vkRegistryContract = await deployVkRegistryContract()
    console.log('VkRegistry:', vkRegistryContract.address)
    if (fs.existsSync(contractFilepath)) {
      fs.renameSync(contractFilepath, contractFilepathOld)
    }
    writeJSONFile(contractFilepath, {'VkRegistry':vkRegistryContract.address})
    return 0
}

export {
    deployVkRegistry,
    configureSubparser,
}
