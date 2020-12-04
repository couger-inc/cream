import * as fs from 'fs'
import * as path from 'path'
import FS from 'fs-extra'
import { promisify } from 'util'
import {
    CreamFactoryContract,
    CreamFactoryInstance,
    VerifierContract,
    VerifierInstance,
    SignUpTokenContract,
    SignUpTokenInstance,
    MiMCInstance,
} from '../types/truffle-contracts'

const CreamFactory: CreamFactoryContract = artifacts.require('CreamFactory')
const Verifier: VerifierContract = artifacts.require('Verifier')
const SignUpToken: SignUpTokenContract = artifacts.require('SignUpToken')
const MiMC: any = artifacts.require('MiMC')

module.exports = (deployer: any) => {
    deployer
        .then(async () => {
            const verifier: VerifierInstance = await Verifier.deployed()
            const signUpToken: SignUpTokenInstance = await SignUpToken.deployed()
            const mimc: MiMCInstance = await MiMC.deployed()
            const { config } = require('cream-config')
            await CreamFactory.link(MiMC, mimc.address)
            await deployer.deploy(CreamFactory)
        })
        .then(async () => {
            const basePath = path.resolve(__dirname, '../app/constants')
            const creamFactory: any = await CreamFactory.deployed()
            FS.mkdirsSync(basePath)
            await promisify(fs.writeFile)(
                path.join(basePath, 'CreamFactoryABI.json'),
                JSON.stringify(creamFactory.abi, null, ' ')
            )
            await promisify(fs.writeFile)(
                path.join(basePath, 'CreamFactoryNetworks.json'),
                JSON.stringify(creamFactory.networks, null, ' ')
            )
        })
}
