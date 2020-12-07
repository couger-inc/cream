const truffleAssert = require('truffle-assertions')
const { toHex, createDeposit, rbigInt } = require('libcream')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')

const CreamFactory = artifacts.require('CreamFactory')
const Verifier = artifacts.require('Verifier')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')

contract('CreamFactory', (accounts) => {
    let instance
    let verifier
    let signUpToken
    let tx
    let creamAddress
    let cream
    let snapshotId
    const MERKLE_HEIGHT = 1
    const DENOMINATION = 1
    const RECIPIENTS = [accounts[1], accounts[2]]
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const VOTER = accounts[3]

    before(async () => {
        instance = await CreamFactory.deployed()
        verifier = await Verifier.deployed()
        signUpToken = await SignUpToken.deployed()
        tx = await instance.createCream(
            verifier.address,
            signUpToken.address,
            DENOMINATION,
            MERKLE_HEIGHT,
            RECIPIENTS,
            IPFS_HASH
        )
        creamAddress = tx.logs[1].args[0]
        cream = await Cream.at(creamAddress)
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialize ownership', async () => {
            assert.notEqual(await instance.owner(), accounts[1])
        })
        it('should fail when non owner tried to create Cream contract', async () => {
            try {
                await instance.createCream(
                    verifier.address,
                    signUpToken.address,
                    DENOMINATION,
                    MERKLE_HEIGHT,
                    RECIPIENTS,
                    IPFS_HASH,
                    { from: VOTER }
                )
            } catch (error) {
                assert.equal(error.reason, 'Ownable: caller is not the owner')
                return
            }
            assert.fail('Expected revert not received')
        })
    })

    describe('contract deploy', () => {
        it('should be able to deploy cream contract', async () => {
            truffleAssert.eventEmitted(tx, 'CreamCreated')
        })

        it('should be able to reveive correct value from mapped contract address', async () => {
            assert.equal(
                await instance.electionDetails(creamAddress),
                IPFS_HASH
            )
        })

        it('should be able to reveive correct value from cream contract side', async () => {
            assert.equal(await cream.verifier(), verifier.address)
            assert.equal(await cream.signUpToken(), signUpToken.address)
            assert.equal(await cream.denomination(), DENOMINATION)
            assert.equal(await cream.recipients(0), RECIPIENTS[0])
        })

        it('should be able to deploy another cream contract', async () => {
            await signUpToken.giveToken(VOTER)
            await signUpToken.setApprovalForAll(creamAddress, true, {
                from: VOTER,
            })

            verifier = await Verifier.new()
            signUpToken = await SignUpToken.new()
            const NEW_RECIPIENTS = [accounts[4], accounts[5]]
            tx = await instance.createCream(
                verifier.address,
                signUpToken.address,
                DENOMINATION,
                MERKLE_HEIGHT,
                NEW_RECIPIENTS,
                IPFS_HASH
            )
            const newCreamAddress = tx.logs[1].args[0]
            const newCream = await Cream.at(newCreamAddress)
            assert.equal(
                await instance.electionDetails(creamAddress),
                IPFS_HASH
            )
            assert.equal(
                await instance.electionDetails(newCreamAddress),
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
