import {
    MACIFactoryContract,
    BatchUpdateStateTreeVerifierSmallContract,
    BatchUpdateStateTreeVerifierSmallInstance,
    PoseidonT3Instance,
    PoseidonT6Instance,
    QuadVoteTallyVerifierSmallContract,
    QuadVoteTallyVerifierSmallInstance,
} from '../types/truffle-contracts'

const MACIFactory: MACIFactoryContract = artifacts.require('MACIFactory')
const PoseidonT3: any = artifacts.require('PoseidonT3')
const PoseidonT6: any = artifacts.require('PoseidonT6')
const BatchUpdateStateTreeVerifierSmall: BatchUpdateStateTreeVerifierSmallContract = artifacts.require(
    'BatchUpdateStateTreeVerifierSmall'
)
const QuadVoteTallyVerifierSmall: QuadVoteTallyVerifierSmallContract = artifacts.require(
    'QuadVoteTallyVerifierSmall'
)

const _stateTreeDepth = 4
const _messageTreeDepth = 4
const _voteOptionTreeDepth = 2
const _tallyBatchSize = 4
const _messageBatchSize = 4
const _signUpDuration = 7 * 86400
const _votingDuration = 7 * 86400

module.exports = (deployer: any) => {
    deployer.then(async () => {
        const poseidonT3: PoseidonT3Instance = await PoseidonT3.deployed()
        const poseidonT6: PoseidonT6Instance = await PoseidonT6.deployed()

        await MACIFactory.link(PoseidonT3, poseidonT3.address)
        await MACIFactory.link(PoseidonT6, poseidonT6.address)

        const batchUstVerifier: BatchUpdateStateTreeVerifierSmallInstance = await BatchUpdateStateTreeVerifierSmall.deployed()
        const qvtVerifier: QuadVoteTallyVerifierSmallInstance = await QuadVoteTallyVerifierSmall.deployed()
        await deployer.deploy(
            MACIFactory,
            _stateTreeDepth,
            _messageTreeDepth,
            _voteOptionTreeDepth,
            _tallyBatchSize,
            _messageBatchSize,
            batchUstVerifier.address,
            qvtVerifier.address,
            _signUpDuration,
            _votingDuration
        )
    })
}
