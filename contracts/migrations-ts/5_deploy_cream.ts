import * as fs from 'fs'
import * as path from 'path'
import FS from 'fs-extra'
import { promisify } from 'util'
import {
    CreamContract,
    CreamInstance,
    VerifierContract,
    VerifierInstance,
    SignUpTokenContract,
    SignUpTokenInstance,
    MiMCInstance,
} from '../types/truffle-contracts'

const Cream: CreamContract = artifacts.require('Cream')
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
            await Cream.link(MiMC, mimc.address)
            await deployer.deploy(
                Cream,
                verifier.address,
                signUpToken.address,
                config.cream.denomination.toString(),
                config.cream.merkleTrees.toString(),
                config.cream.recipients
            )
        })
        .then(async () => {
            const basePath = path.resolve(__dirname, '../app/constants')
            const cream: any = await Cream.deployed()
            FS.mkdirsSync(basePath)
            await promisify(fs.writeFile)(
                path.join(basePath, 'CreamABI.json'),
                JSON.stringify(cream.abi, null, ' ')
            )
            await promisify(fs.writeFile)(
                path.join(basePath, 'CreamNetworks.json'),
                JSON.stringify(cream.networks, null, ' ')
            )
        })
}
