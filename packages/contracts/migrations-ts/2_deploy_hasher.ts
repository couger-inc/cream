import * as path from 'path'
import genContract from 'circomlib/src/poseidon_gencontract.js'
import Artifactor from '@truffle/artifactor'
import { PoseidonContract } from '../types/truffle-contracts'

module.exports = (deployer: any) => {
    return deployer.then(async () => {
        const contractsDir = path.join(__dirname, '..', 'build/contracts')
        let artifactor = new Artifactor(contractsDir)
        let contractName = 'Poseidon'
        await artifactor
            .save({
                contractName,
                abi: genContract.generateABI(2),
                unlinked_binary: genContract.createCode(2),
            })
            .then(async () => {
                //const hasherContract: MiMCContract = artifacts.require('MiMC')
                const hasherContract: PoseidonContract = artifacts.require(
                    'Poseidon'
                )
                await deployer.deploy(hasherContract)
            })
    })
}
