const truffleAssert = require('truffle-assertions')
const { config } = require('cream-config')
const { createDeposit, rbigInt } = require('libcream')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const { Keypair, PrivKey } = require('maci-domainobjs')

const CreamFactory = artifacts.require('CreamFactory')
const CreamVerifier = artifacts.require('CreamVerifier')
const VotingToken = artifacts.require('VotingToken')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')

contract('CreamFactory', (accounts) => {
    let creamFactory
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

    const BALANCE = config.maci.initialVoiceCreditBalance
    const LEVELS = config.cream.merkleTrees
    const RECIPIENTS = config.cream.recipients
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const voter = accounts[1]
    const coordinatorAddress = accounts[2]
    const coordinator = new Keypair(
        new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )

    before(async () => {
        creamFactory = await CreamFactory.deployed()
        creamVerifier = await CreamVerifier.deployed()
        votingToken = await VotingToken.deployed()
        signUpToken = await SignUpToken.deployed()
        maciFactory = await MACIFactory.deployed()
        await maciFactory.transferOwnership(creamFactory.address)
        tx = await creamFactory.createCream(
            votingToken.address,
            signUpToken.address,
            BALANCE,
            LEVELS,
            RECIPIENTS,
            IPFS_HASH,
            coordinator.pubKey.asContractParam(),
            coordinatorAddress
        )
        creamAddress = tx.logs[4].args[0]
        cream = await Cream.at(creamAddress)
        maciAddress = await cream.maci()
        maci = await MACI.at(maciAddress)
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialize ownership', async () => {
            assert.notEqual(await creamFactory.owner(), accounts[1])
        })

	  // removed onlyOwner at the moment since anyone should be able to deploy new cream contract
	  //
      // it('should fail when non owner tried to create Cream contract', async () => {
	  //     try {
	  //         await creamFactory.createCream(
	  //             votingToken.address,
	  //             signUpToken.address,
	  //             BALANCE,
	  //             LEVELS,
	  //             RECIPIENTS,
	  //             IPFS_HASH,
	  //             coordinator.pubKey.asContractParam(),
			 //             coordinatorAddress,
			 //             { from: voter }
	  //         )
	  //     } catch (error) {
	  //         assert.equal(error.reason, 'Ownable: caller is not the owner')
	  //         return
	  //     }
	  //     assert.fail('Expected revert not received')
	  // })

        it('should correctly set maci contract from CreamFactory', async () => {
            const creamCoordinatorPubKey = await maci.coordinatorPubKey()
            assert(
                creamCoordinatorPubKey.x,
                coordinator.pubKey.asContractParam().x
            )
            assert(
                creamCoordinatorPubKey.y,
                coordinator.pubKey.asContractParam().y
            )
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
            assert.equal(await cream.recipients(0), RECIPIENTS[0])
            assert.equal(await cream.coordinator(), coordinatorAddress)
        })

        it('should be able to deploy another cream contract', async () => {
            await votingToken.giveToken(voter)
            await votingToken.setApprovalForAll(creamAddress, true, {
                from: voter,
            })

            votingToken = await VotingToken.new()
            const NEW_RECIPIENTS = [accounts[4], accounts[5]]
            tx = await creamFactory.createCream(
                votingToken.address,
                signUpToken.address,
                BALANCE,
                LEVELS,
                NEW_RECIPIENTS,
                IPFS_HASH,
                coordinator.pubKey.asContractParam(),
                coordinatorAddress
            )
            const newCreamAddress = tx.logs[4].args[0]
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
