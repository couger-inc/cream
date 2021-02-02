const truffleAssert = require('truffle-assertions')
const { config } = require('cream-config')
const { toHex, createDeposit, rbigInt } = require('libcream')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const { Keypair } = require('maci-domainobjs')

const CreamFactory = artifacts.require('CreamFactory')
const CreamVerifier = artifacts.require('CreamVerifier')
const VotingToken = artifacts.require('VotingToken')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')
const SignUpTokenGatekeeper = artifacts.require('SignUpTokenGatekeeper')
const ConstantInitialVoiceCreditProxy = artifacts.require(
    'ConstantInitialVoiceCreditProxy'
)

contract('CreamFactory', (accounts) => {
    let creamFactory
    let verifier
    let votingToken
    let signUpToken
    let tx
    let creamAddress
    let cream
    let snapshotId
    let coordinatorPubKey
    let maciFactory
    let maciAddress
    let maci
    const MERKLE_HEIGHT = 1
    const DENOMINATION = 1
    const RECIPIENTS = [accounts[1], accounts[2]]
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const VOTER = accounts[3]
    const COORDINATOR = accounts[4]

    before(async () => {
        creamFactory = await CreamFactory.deployed()
        creamVerifier = await CreamVerifier.deployed()
        votingToken = await VotingToken.deployed()
        signUpToken = await SignUpToken.deployed()
        maciFactory = await MACIFactory.deployed()
        const signUpGatekeeper = await SignUpTokenGatekeeper.new(
            signUpToken.address
        )
        const ConstantinitialVoiceCreditProxy = await ConstantInitialVoiceCreditProxy.new(
            config.maci.initialVoiceCreditBalance
        )
        await maciFactory.transferOwnership(creamFactory.address)
        coordinatorPubKey = new Keypair().pubKey.asContractParam()
        tx = await creamFactory.createCream(
            votingToken.address,
            DENOMINATION,
            MERKLE_HEIGHT,
            RECIPIENTS,
            IPFS_HASH,
            coordinatorPubKey,
            COORDINATOR,
            signUpToken.address,
            { from: accounts[0] }
        )
        creamAddress = tx.logs[3].args[0]
        cream = await Cream.at(creamAddress)
        maciAddress = await cream.maci()
        maci = await MACI.at(maciAddress)
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialize ownership', async () => {
            assert.notEqual(await creamFactory.owner(), accounts[1])
        })

        it('should fail when non owner tried to create Cream contract', async () => {
            try {
                await creamFactory.createCream(
                    votingToken.address,
                    DENOMINATION,
                    MERKLE_HEIGHT,
                    RECIPIENTS,
                    IPFS_HASH,
                    coordinatorPubKey,
                    COORDINATOR,
                    signUpToken.address,
                    { from: VOTER }
                )
            } catch (error) {
                assert.equal(error.reason, 'Ownable: caller is not the owner')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should correctly set maci contract from CreamFactory', async () => {
            const creamCoordinatorPubKey = await maci.coordinatorPubKey()
            assert(creamCoordinatorPubKey.x, coordinatorPubKey.x)
            assert(creamCoordinatorPubKey.y, coordinatorPubKey.y)
        })

        it('should be able to set MACI parameters from CreamFactory', async () => {
            const _stateTreeDepth = 8
            const _messageTreeDepth = 12
            const _voteOptionTreeDepth = 4
            const _tallyBatchSize = await maci.tallyBatchSize()
            const _messageBatchSize = await maci.messageBatchSize()
            const _signUpDuration = await maci.signUpDurationSeconds()
            const _votingDuration = 86400
            const _batchUstVerifier = await maciFactory.batchUstVerifier()
            const _qvtVerifier = await maciFactory.qvtVerifier()

            await creamFactory.setMaciParameters(
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
        })
    })

    describe('contract deploy', () => {
        it('should be able to deploy cream contract', async () => {
            truffleAssert.eventEmitted(tx, 'CreamCreated')
        })

        it('should be able to reveive correct value from mapped contract address', async () => {
            assert.equal(
                await creamFactory.electionDetails(creamAddress),
                IPFS_HASH
            )
        })

        it('should be able to reveive correct value from cream contract side', async () => {
            assert.equal(await cream.verifier(), creamVerifier.address)
            assert.equal(await cream.votingToken(), votingToken.address)
            assert.equal(await cream.denomination(), DENOMINATION)
            assert.equal(await cream.recipients(0), RECIPIENTS[0])
            assert.equal(await cream.coordinator(), COORDINATOR)
        })

        it('should be able to deploy another cream contract', async () => {
            await votingToken.giveToken(VOTER)
            await votingToken.setApprovalForAll(creamAddress, true, {
                from: VOTER,
            })

            coordinatorPubKey = new Keypair().pubKey.asContractParam()

            votingToken = await VotingToken.new()
            const NEW_RECIPIENTS = [accounts[4], accounts[5]]
            tx = await creamFactory.createCream(
                votingToken.address,
                DENOMINATION,
                MERKLE_HEIGHT,
                NEW_RECIPIENTS,
                IPFS_HASH,
                coordinatorPubKey,
                COORDINATOR,
                signUpToken.address
            )
            const newCreamAddress = tx.logs[3].args[0]
            const newCream = await Cream.at(newCreamAddress)
            assert.equal(
                await creamFactory.electionDetails(creamAddress),
                IPFS_HASH
            )
            assert.equal(
                await creamFactory.electionDetails(newCreamAddress),
                IPFS_HASH
            )
        })
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
    })
})
