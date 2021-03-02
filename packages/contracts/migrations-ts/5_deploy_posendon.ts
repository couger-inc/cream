import * as path from 'path'
import genContract from 'circomlib/src/poseidon_gencontract.js'
import Artifactor from '@truffle/artifactor'
import {
    PoseidonT3Contract,
    PoseidonT6Contract,
} from '../types/truffle-contracts'

module.exports = (deployer: any) => {
    return deployer.then(async () => {
        const contractsDir = path.join(__dirname, '..', 'build/contracts')
        const poseidons = ['PoseidonT3', 'PoseidonT6']
        let contractName
        for (contractName of poseidons) {
            const artifactor = new Artifactor(contractsDir)
            const arg = contractName === 'PoseidonT3' ? 2 : 5
            await artifactor
                .save({
                    contractName,
                    abi: genContract.abi,
                    unlinked_binary: genContract.createCode(arg),
                })
                .then(async () => {
                    const contract: any = artifacts.require(contractName)
                    await deployer.deploy(contract)
                })
        }
    })
}
