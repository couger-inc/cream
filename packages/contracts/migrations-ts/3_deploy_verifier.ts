import { CreamVerifierContract } from '../types/truffle-contracts'

const CreamVerifier: CreamVerifierContract = artifacts.require('CreamVerifier')

module.exports = (deployer) => {
    deployer.deploy(CreamVerifier)
}
