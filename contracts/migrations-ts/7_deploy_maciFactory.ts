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

const { config } = require('cream-config')

const _stateTreeDepth = config.maci.merkleTrees.stateTreeDepth
const _messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const _voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth
const _tallyBatchSize = config.maci.tallyBatchsize
const _messageBatchSize = config.maci.messageBatchSize
const _signUpDuration = 7 * 2 * 24 * Number(config.maci.signUpDurationInSeconds)
const _votingDuration = 7 * 2 * 24 * Number(config.maci.signUpDurationInSeconds)

module.exports = (deployer: any) => {
    deployer.then(async () => {
        const poseidonT3: PoseidonT3Instance = await PoseidonT3.deployed()
        const poseidonT6: PoseidonT6Instance = await PoseidonT6.deployed()

        await MACIFactory.link(PoseidonT3, poseidonT3.address)
        await MACIFactory.link(PoseidonT6, poseidonT6.address)

        const _batchUstVerifier: BatchUpdateStateTreeVerifierSmallInstance = await BatchUpdateStateTreeVerifierSmall.deployed()
        const _qvtVerifier: QuadVoteTallyVerifierSmallInstance = await QuadVoteTallyVerifierSmall.deployed()
        await deployer.deploy(
            MACIFactory,
            _stateTreeDepth,
            _messageTreeDepth,
            _voteOptionTreeDepth,
            _tallyBatchSize,
            _messageBatchSize,
            _batchUstVerifier.address,
            _qvtVerifier.address,
            _signUpDuration,
            _votingDuration
        )
    })
}
