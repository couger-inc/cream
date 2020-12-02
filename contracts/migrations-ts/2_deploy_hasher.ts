import * as path from 'path'
import genContract from 'circomlib/src/mimcsponge_gencontract.js'
import Artifactor from '@truffle/artifactor'
import { MiMCContract } from '../types/truffle-contracts'

module.exports = (deployer: any) => {
    return deployer.then(async () => {
        const contractsDir = path.join(__dirname, '..', 'build/contracts')
        let artifactor = new Artifactor(contractsDir)
        let contractName = 'MiMC'
        await artifactor
            .save({
                contractName,
                abi: genContract.abi,
                unlinked_binary: genContract.createCode('mimcsponge', 220),
            })
            .then(async () => {
                const hasherContract: MiMCContract = artifacts.require('MiMC')
                await deployer.deploy(hasherContract)
            })
    })
}
