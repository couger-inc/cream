import { VerifierContract } from '../types/truffle-contracts'

const Verifier: VerifierContract = artifacts.require('Verifier')

module.exports = (deployer) => {
    deployer.deploy(Verifier)
}
