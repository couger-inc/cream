import {
    BatchUpdateStateTreeVerifierSmallContract,
    QuadVoteTallyVerifierSmallContract,
} from '../types/truffle-contracts'

// TODO : prepare for both small and normal size verifier
const BatchUpdateStateTreeVerifierSmall: BatchUpdateStateTreeVerifierSmallContract = artifacts.require(
    'BatchUpdateStateTreeVerifierSmall'
)
const QuadVoteTallyVerifierSmall: QuadVoteTallyVerifierSmallContract = artifacts.require(
    'QuadVoteTallyVerifierSmall'
)

module.exports = (deployer) => {
    deployer.deploy(BatchUpdateStateTreeVerifierSmall)
    deployer.deploy(QuadVoteTallyVerifierSmall)
}
