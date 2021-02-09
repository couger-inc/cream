import * as fs from 'fs'
import * as path from 'path'
import FS from 'fs-extra'
import { promisify } from 'util'
import {
    CreamFactoryContract,
    CreamFactoryInstance,
    CreamVerifierContract,
    CreamVerifierInstance,
    VotingTokenContract,
    VotingTokenInstance,
    MACIFactoryContract,
    MACIFactoryInstance,
    MiMCInstance,
} from '../types/truffle-contracts'

const CreamFactory: CreamFactoryContract = artifacts.require('CreamFactory')
const CreamVerifier: CreamVerifierContract = artifacts.require('CreamVerifier')
const VotingToken: VotingTokenContract = artifacts.require('VotingToken')
const MACIFactory: MACIFactoryContract = artifacts.require('MACIFactory')
const MiMC: any = artifacts.require('MiMC')

module.exports = (deployer: any) => {
    deployer
        .then(async () => {
            const creamVerifier: CreamVerifierInstance = await CreamVerifier.deployed()
            const maciFactory: MACIFactoryInstance = await MACIFactory.deployed()
            const votingToken: VotingTokenInstance = await VotingToken.deployed()
            const mimc: MiMCInstance = await MiMC.deployed()
            await CreamFactory.link(MiMC, mimc.address)
            await deployer.deploy(
                CreamFactory,
                maciFactory.address,
                creamVerifier.address
            )
        })
        .then(async () => {
            const basePath = path.resolve(__dirname, '../app/constants')
            const maciFactory: any = await MACIFactory.deployed()
            const creamFactory: any = await CreamFactory.deployed()
            FS.mkdirsSync(basePath)
            await promisify(fs.writeFile)(
                path.join(basePath, 'MACIFactoryABI.json'),
                JSON.stringify(maciFactory.abi, null, ' ')
            )
            await promisify(fs.writeFile)(
                path.join(basePath, 'MACIFactoryNetworks.json'),
                JSON.stringify(maciFactory.constructor.networks, null, ' ')
            )
            await promisify(fs.writeFile)(
                path.join(basePath, 'CreamFactoryABI.json'),
                JSON.stringify(creamFactory.abi, null, ' ')
            )
            await promisify(fs.writeFile)(
                path.join(basePath, 'CreamFactoryNetworks.json'),
                JSON.stringify(creamFactory.constructor.networks, null, ' ')
            )
        })
}
