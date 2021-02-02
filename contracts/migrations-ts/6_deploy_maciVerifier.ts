import {
    BatchUpdateStateTreeVerifierContract,
    QuadVoteTallyVerifierContract,
} from '../types/truffle-contracts'

// TODO : prepare for both small and normal size verifier
const BatchUpdateStateTreeVerifier: BatchUpdateStateTreeVerifierContract = artifacts.require(
    'BatchUpdateStateTreeVerifier'
)
const QuadVoteTallyVerifier: QuadVoteTallyVerifierContract = artifacts.require(
    'QuadVoteTallyVerifier'
)

module.exports = (deployer) => {
    deployer.deploy(BatchUpdateStateTreeVerifier)
    deployer.deploy(QuadVoteTallyVerifier)
}
