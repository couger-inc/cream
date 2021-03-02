const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const { bigInt } = require('libcream')
const { config } = require('cream-config')
const { Keypair, PrivKey } = require('maci-domainobjs')
const truffleAssert = require('truffle-assertions')

const MACIFactory = artifacts.require('MACIFactory')
const BatchUpdateStateTreeVerifier = artifacts.require(
    'BatchUpdateStateTreeVerifier'
)
const Cream = artifacts.require('Cream')
const VotingToken = artifacts.require('VotingToken')
const CreamVerifier = artifacts.require('CreamVerifier')
const MiMC = artifacts.require('MiMC')

const LEVELS = config.cream.merkleTrees
const RECIPIENTS = config.cream.recipients
const ZERO_VALUE = config.cream.zeroValue
const recipient = config.cream.recipients[0]

contract('MACIFactory', (accounts) => {
    let maciFactory
    let snapshotId
    let creamVerifier
    let mimc
    let votingToken
    let cream
    const coordinatorAddress = accounts[1]
    const coordinator = new Keypair(
        new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )

    before(async () => {
        maciFactory = await MACIFactory.deployed()
        batchUstVerifierMaciFactory = await BatchUpdateStateTreeVerifier.deployed()
        creamVerifier = await CreamVerifier.deployed()
        mimc = await MiMC.deployed()
        votingToken = await VotingToken.deployed()
        await Cream.link(MiMC, mimc.address)
        cream = await Cream.new(
            creamVerifier.address,
            votingToken.address,
            LEVELS,
            RECIPIENTS,
            coordinatorAddress
        )
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialized', async () => {
            const batchUstVerifierAddress = await maciFactory.batchUstVerifier()
            const votingDuration = await maciFactory.votingDuration()
            const expectedDuration = config.maci.votingDurationInSeconds
            assert.equal(
                batchUstVerifierAddress,
                batchUstVerifierMaciFactory.address
            )
            assert.equal(expectedDuration, votingDuration)
        })

        it('should be able to deploy MACI', async () => {
            const tx = await maciFactory.deployMaci(
                cream.address,
                cream.address,
                coordinator.pubKey.asContractParam()
            )
            truffleAssert.eventEmitted(tx, 'MaciDeployed')
        })

        it('should revert if non owner try to deploy MACI', async () => {
            try {
                const tx = await maciFactory.deployMaci(
                    cream.address,
                    cream.address,
                    coordinator.pubKey.asContractParam(),
                    { from: accounts[2] }
                )
            } catch (error) {
                assert.equal(error.reason, 'Ownable: caller is not the owner')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should be able to set MACI parameters', async () => {
            const MACI = artifacts.require('MACI')
            const tx = await maciFactory.deployMaci(
                cream.address,
                cream.address,
                coordinator.pubKey.asContractParam()
            )

            const maciAddress = tx.logs[2].args[0]
            const maci = await MACI.at(maciAddress)

            const _stateTreeDepth = 8
            const _messageTreeDepth = 12
            const _voteOptionTreeDepth = 4
            const _tallyBatchSize = await maci.tallyBatchSize()
            const _messageBatchSize = await maci.messageBatchSize()
            const _signUpDuration = await maci.signUpDurationSeconds()
            const _votingDuration = 86400
            const _batchUstVerifier = await maciFactory.batchUstVerifier()
            const _qvtVerifier = await maciFactory.qvtVerifier()
            const tx2 = await maciFactory.setMaciParameters(
                _stateTreeDepth,
                _messageTreeDepth,
                _voteOptionTreeDepth,
                _tallyBatchSize,
                _messageBatchSize,
                _batchUstVerifier,
                _qvtVerifier,
                _signUpDuration,
                _votingDuration
            )
            truffleAssert.eventEmitted(tx2, 'MaciParametersChanged')
        })

        it('should fail if non owner try to set MACI pamameter', async () => {
            const MACI = artifacts.require('MACI')
            const tx = await maciFactory.deployMaci(
                cream.address,
                cream.address,
                coordinator.pubKey.asContractParam()
            )

            const maciAddress = tx.logs[2].args[0]
            const maci = await MACI.at(maciAddress)

            const _stateTreeDepth = 8
            const _messageTreeDepth = 12
            const _voteOptionTreeDepth = 4
            const _tallyBatchSize = await maci.tallyBatchSize()
            const _messageBatchSize = await maci.messageBatchSize()
            const _signUpDuration = await maci.signUpDurationSeconds()
            const _votingDuration = 86400
            const _batchUstVerifier = await maciFactory.batchUstVerifier()
            const _qvtVerifier = await maciFactory.qvtVerifier()

            try {
                const tx2 = await maciFactory.setMaciParameters(
                    _stateTreeDepth,
                    _messageTreeDepth,
                    _voteOptionTreeDepth,
                    _tallyBatchSize,
                    _messageBatchSize,
                    _batchUstVerifier,
                    _qvtVerifier,
                    _signUpDuration,
                    _votingDuration,
                    { from: accounts[2] }
                )
            } catch (error) {
                assert.equal(error.reason, 'Ownable: caller is not the owner')
                return
            }
            assert.fail('Expected revert not received')
        })
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
    })
})
