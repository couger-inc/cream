import {
    VotingTokenContract,
    SignUpTokenContract,
} from '../types/truffle-contracts'

const VotingToken: VotingTokenContract = artifacts.require('VotingToken')
const SignUpToken: SignUpTokenContract = artifacts.require('SignUpToken')

module.exports = (deployer: Truffle.Deployer) => {
    deployer.deploy(VotingToken)
    deployer.deploy(SignUpToken)
}
