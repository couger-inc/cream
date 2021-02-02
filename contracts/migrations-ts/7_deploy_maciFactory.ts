import {
    MACIFactoryContract,
    BatchUpdateStateTreeVerifierContract,
    BatchUpdateStateTreeVerifierInstance,
    PoseidonT3Instance,
    PoseidonT6Instance,
    QuadVoteTallyVerifierContract,
    QuadVoteTallyVerifierInstance,
} from '../types/truffle-contracts'

const MACIFactory: MACIFactoryContract = artifacts.require('MACIFactory')
const PoseidonT3: any = artifacts.require('PoseidonT3')
const PoseidonT6: any = artifacts.require('PoseidonT6')
const BatchUpdateStateTreeVerifier: BatchUpdateStateTreeVerifierContract = artifacts.require(
    'BatchUpdateStateTreeVerifier'
)
const QuadVoteTallyVerifier: QuadVoteTallyVerifierContract = artifacts.require(
    'QuadVoteTallyVerifier'
)

const { config } = require('cream-config')

const _stateTreeDepth = config.maci.merkleTrees.stateTreeDepth // 4
const _messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
const _voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
const _tallyBatchSize = config.maci.tallyBatchsize
const _messageBatchSize = config.maci.messageBatchSize
const _signUpDuration = config.maci.signUpDurationInSeconds
const _votingDuration = config.maci.votingDurationInSeconds

module.exports = (deployer: any) => {
    deployer.then(async () => {
        const poseidonT3: PoseidonT3Instance = await PoseidonT3.deployed()
        const poseidonT6: PoseidonT6Instance = await PoseidonT6.deployed()
        await deployer.link(PoseidonT3, MACIFactory)
        await deployer.link(PoseidonT6, MACIFactory)

        const _batchUstVerifier: BatchUpdateStateTreeVerifierInstance = await BatchUpdateStateTreeVerifier.deployed()
        const _qvtVerifier: QuadVoteTallyVerifierInstance = await QuadVoteTallyVerifier.deployed()
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
