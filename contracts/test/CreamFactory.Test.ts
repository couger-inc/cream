const truffleAssert = require('truffle-assertions')
const { toHex, createDeposit, rbigInt } = require('libcream')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const { Keypair } = require('maci-domainobjs')

const CreamFactory = artifacts.require('CreamFactory')
const CreamVerifier = artifacts.require('CreamVerifier')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')

contract('CreamFactory', (accounts) => {
    let creamFactory
    let verifier
    let signUpToken
    let tx
    let creamAddress
    let cream
    let snapshotId
    let coordinatorPubKey
    let maciFactory
    const MERKLE_HEIGHT = 1
    const DENOMINATION = 1
    const RECIPIENTS = [accounts[1], accounts[2]]
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const VOTER = accounts[3]

    before(async () => {
        creamFactory = await CreamFactory.deployed()
        creamVerifier = await CreamVerifier.deployed()
        signUpToken = await SignUpToken.deployed()
        maciFactory = await MACIFactory.deployed()
        await maciFactory.transferOwnership(creamFactory.address);
        coordinatorPubKey = new Keypair().pubKey.asContractParam()
        tx = await creamFactory.createCream(
            signUpToken.address,
            DENOMINATION,
            MERKLE_HEIGHT,
            RECIPIENTS,
            IPFS_HASH,
            coordinatorPubKey,
            { from: accounts[0] }
        )
        creamAddress = tx.logs[3].args[0]
        cream = await Cream.at(creamAddress)
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialize ownership', async () => {
            assert.notEqual(await creamFactory.owner(), accounts[1])
        })

        it('should fail when non owner tried to create Cream contract', async () => {
            try {
                await creamFactory.createCream(
                    signUpToken.address,
                    DENOMINATION,
                    MERKLE_HEIGHT,
                    RECIPIENTS,
                    IPFS_HASH,
                    coordinatorPubKey,
                    { from: VOTER }
                )
            } catch (error) {
                assert.equal(error.reason, 'Ownable: caller is not the owner')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should correctly set maci contract', async () => {
            const maciAddress = await cream.maci()
            const maci = await MACI.at(maciAddress)
            const creamCoordinatorPubKey = await maci.coordinatorPubKey()
            assert(creamCoordinatorPubKey.x, coordinatorPubKey.x)
            assert(creamCoordinatorPubKey.y, coordinatorPubKey.y)
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
            assert.equal(await cream.signUpToken(), signUpToken.address)
            assert.equal(await cream.denomination(), DENOMINATION)
            assert.equal(await cream.recipients(0), RECIPIENTS[0])
        })

        it('should be able to deploy another cream contract', async () => {
            await signUpToken.giveToken(VOTER)
            await signUpToken.setApprovalForAll(creamAddress, true, {
                from: VOTER,
            })

            coordinatorPubKey = new Keypair().pubKey.asContractParam()

            signUpToken = await SignUpToken.new()
            const NEW_RECIPIENTS = [accounts[4], accounts[5]]
            tx = await creamFactory.createCream(
                signUpToken.address,
                DENOMINATION,
                MERKLE_HEIGHT,
                NEW_RECIPIENTS,
                IPFS_HASH,
                coordinatorPubKey
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
