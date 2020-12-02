import { SignUpTokenContract } from '../types/truffle-contracts'

const SignUpToken: SignUpTokenContract = artifacts.require('SignUpToken')

module.exports = (deployer: Truffle.Deployer) => {
    deployer.deploy(SignUpToken)
}
