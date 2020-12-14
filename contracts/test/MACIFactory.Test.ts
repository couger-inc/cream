const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const { bigInt } = require('libcream')
const { config } = require('cream-config')
const { Keypair } = require('maci-domainobjs')
const truffleAssert = require('truffle-assertions')

const MACIFactory = artifacts.require('MACIFactory')
const BatchUpdateStateTreeVerifierSmall = artifacts.require(
    'BatchUpdateStateTreeVerifierSmall'
)

contract('MACIFactory', (accounts) => {
    let maciFactory
    let snapshotId

    before(async () => {
        maciFactory = await MACIFactory.deployed()
        batchUstVerifierMaciFactory = await BatchUpdateStateTreeVerifierSmall.deployed()
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialized', async () => {
            const batchUstVerifierAddress = await maciFactory.batchUstVerifier()
            const votingDuration = await maciFactory.votingDuration()

            assert.equal(
                batchUstVerifierAddress,
                batchUstVerifierMaciFactory.address
            )
            assert.equal(votingDuration, 604800)
        })

        it('should be able to deploy MACI', async () => {
            // deploy cream to get cream contract address
            const Cream = artifacts.require('Cream')
            const SignUpToken = artifacts.require('SignUpToken')
            const CreamVerifier = artifacts.require('CreamVerifier')
            const MiMC = artifacts.require('MiMC')

            const LEVELS = config.cream.merkleTrees.toString()
            const ZERO_VALUE = config.cream.zeroValue
            const value = config.cream.denomination.toString()
            const recipient = config.cream.recipients[0]
            const fee = bigInt(value).shr(0)

            const creamVerifier = await CreamVerifier.deployed()
            const mimc = await MiMC.deployed()
            const tokenContract = await SignUpToken.deployed()
            await Cream.link(MiMC, mimc.address)
            const cream = await Cream.new(
                creamVerifier.address,
                tokenContract.address,
                value,
                LEVELS,
                config.cream.recipients
            )
            const coordinatorPubKey = new Keypair().pubKey.asContractParam()
            const tx = await maciFactory.deployMaci(
                cream.address,
                cream.address,
                coordinatorPubKey
            )
            truffleAssert.eventEmitted(tx, 'MaciDeployed')
        })

        it('should revert if non owner try to deploy MACI', async () => {
            const Cream = artifacts.require('Cream')
            const SignUpToken = artifacts.require('SignUpToken')
            const CreamVerifier = artifacts.require('CreamVerifier')
            const MiMC = artifacts.require('MiMC')

            const LEVELS = config.cream.merkleTrees.toString()
            const ZERO_VALUE = config.cream.zeroValue
            const value = config.cream.denomination.toString()
            const recipient = config.cream.recipients[0]
            const fee = bigInt(value).shr(0)

            const creamVerifier = await CreamVerifier.deployed()
            const mimc = await MiMC.deployed()
            const tokenContract = await SignUpToken.deployed()
            await Cream.link(MiMC, mimc.address)
            const cream = await Cream.new(
                creamVerifier.address,
                tokenContract.address,
                value,
                LEVELS,
                config.cream.recipients
            )
            const coordinatorPubKey = new Keypair().pubKey.asContractParam()
            try {
                const tx = await maciFactory.deployMaci(
                    cream.address,
                    cream.address,
                    coordinatorPubKey,
                    { from: accounts[2] }
                )
            } catch (error) {
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should be able to set MACI parameters', async () => {
            const Cream = artifacts.require('Cream')
            const SignUpToken = artifacts.require('SignUpToken')
            const CreamVerifier = artifacts.require('CreamVerifier')
            const MiMC = artifacts.require('MiMC')
            const MACI = artifacts.require('MACI')

            const LEVELS = config.cream.merkleTrees.toString()
            const ZERO_VALUE = config.cream.zeroValue
            const value = config.cream.denomination.toString()
            const recipient = config.cream.recipients[0]
            const fee = bigInt(value).shr(0)

            const creamVerifier = await CreamVerifier.deployed()
            const mimc = await MiMC.deployed()
            const tokenContract = await SignUpToken.deployed()
            await Cream.link(MiMC, mimc.address)
            const cream = await Cream.new(
                creamVerifier.address,
                tokenContract.address,
                value,
                LEVELS,
                config.cream.recipients
            )
            const coordinatorPubKey = new Keypair().pubKey.asContractParam()
            const tx = await maciFactory.deployMaci(
                cream.address,
                cream.address,
                coordinatorPubKey
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
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
    })
})
