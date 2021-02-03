const { ethers } = require('ethers')
const { config } = require('cream-config')
const { MaciState } = require('maci-core')
const { hashLeftRight, IncrementalQuinTree } = require('maci-crypto')
const { Keypair, PrivKey } = require('maci-domainobjs')
const { timeTravel } = require('./TestUtil')
const truffleAssert = require('truffle-assertions')

const SignUpToken = artifacts.require('SignUpToken')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')
const SignUpTokenGatekeeper = artifacts.require('SignUpTokenGatekeeper')
const ConstantInitialVoiceCreditProxy = artifacts.require(
    'ConstantInitialVoiceCreditProxy'
)

/*
 * To make this app more loose coupling this test should work without Cream contract implementation
 */
contract('Maci(SignUp)', (accounts) => {
    let coordinatorPubKey
    let maciFactory
    let signUpToken
    let maciTx
    let maci
    let snapshotId
    const batchSize = config.maci.messageBatchSize // 4
    const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth // 4
    const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
    const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
    const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex // 3

    const contractOwner = accounts[0]
    const coordinatorAddress = accounts[1]
    const coordinator = new Keypair(
        new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )

    const user1 = {
        wallet: accounts[2],
        keypair: new Keypair(),
    }

    const user2 = {
        wallet: accounts[3],
        keypair: new Keypair(),
    }

    const maciState = new MaciState(
        coordinator,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        voteOptionsMaxIndex
    )

    before(async () => {
        maciFactory = await MACIFactory.deployed()
        signUpToken = await SignUpToken.deployed()
        const signUpGatekeeper = await SignUpTokenGatekeeper.new(
            signUpToken.address
        )
        const ConstantinitialVoiceCreditProxy = await ConstantInitialVoiceCreditProxy.new(
            config.maci.initialVoiceCreditBalance
        )
        maciTx = await maciFactory.deployMaci(
            signUpGatekeeper.address,
            ConstantinitialVoiceCreditProxy.address,
            coordinator.pubKey.asContractParam()
        )
        const maciAddress = maciTx.logs[2].args[0]
        maci = await MACI.at(maciAddress)

        // give away a signUpToken to each user
        await signUpToken.giveToken(user1.wallet)
        await signUpToken.giveToken(user2.wallet)
    })

    describe('initialize', () => {
        it('should own a token', async () => {
            const ownerOfToken1 = await signUpToken.ownerOf(1)
            assert.equal(ownerOfToken1, user1.wallet)

            const ownerOfToken2 = await signUpToken.ownerOf(2)
            assert.equal(ownerOfToken2, user2.wallet)
        })

        it('should have correct emptyVoteOptionTreeRoot value', async () => {
            const temp = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))
            const emptyVoteOptionTreeRoot = temp.root

            const root = await maci.emptyVoteOptionTreeRoot()
            assert.equal(emptyVoteOptionTreeRoot.toString(), root.toString())
        })

        it('should have correct currentResultsCommitment value', async () => {
            const crc = await maci.currentResultsCommitment()
            const tree = new IncrementalQuinTree(voteOptionTreeDepth, 0)
            const expected = hashLeftRight(tree.root, BigInt(0))

            assert.equal(crc.toString(), expected.toString())
        })

        it('should have correct currentSpentVoiceCreditsCommitment value', async () => {
            const comm = await maci.currentSpentVoiceCreditsCommitment()
            const expected = hashLeftRight(BigInt(0), BigInt(0))

            assert.equal(comm.toString(), expected.toString())
        })

        it('should have same state root value', async () => {
            const root = await maci.getStateTreeRoot()
            assert.equal(maciState.genStateRoot().toString(), root.toString())
        })
    })

    describe('sign up', () => {
        // add this (same)test just for debug purpose
        it('should have same state root value', async () => {
            const root = await maci.getStateTreeRoot()
            assert.equal(maciState.genStateRoot().toString(), root.toString())
        })

        it('should revert if user does not own a SignUpToken', async () => {
            const user3 = {
                wallet: accounts[5],
                keypair: new Keypair(),
            }

            try {
                await maci.signUp(
                    user3.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                    { from: user3.wallet }
                )
            } catch (error) {
                assert.equal(
                    error.reason,
                    'SignUpTokenGatekeeper: this user does not own the token'
                )
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should be able to sign up with SignUpToken', async () => {
            maciState.signUp(
                user1.keypair.pubKey,
                BigInt(config.maci.initialVoiceCreditBalance)
            )

            const tx = await maci.signUp(
                user1.keypair.pubKey.asContractParam(),
                ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                { from: user1.wallet }
            )

            truffleAssert.eventEmitted(tx, 'SignUp')

            // The roots should match
            const root = await maci.getStateTreeRoot()
            assert.equal(maciState.genStateRoot().toString(), root.toString())
        })

        it('should revert if user uses to sign up with previously used SignUpToken', async () => {
            try {
                await maci.signUp(
                    user1.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                    { from: user1.wallet }
                )
            } catch (error) {
                assert.equal(
                    error.reason,
                    'SignUpTokenGatekeeper: this token has already been used to sign up'
                )
                return
            }
            assert.fail('Expected revet not received')
        })

        it('should revert after sign up deadline', async () => {
            const duration = config.maci.signUpDurationInSeconds + 1
            await timeTravel(duration)
            try {
                await maci.signUp(
                    user2.keypair.pubKey.asContractParam(),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [2]),
                    ethers.utils.defaultAbiCoder.encode(['uint256'], [0]),
                    { from: user2.wallet }
                )
            } catch (error) {
                assert.equal(
                    error.reason,
                    'MACI: the sign-up period has passed'
                )
                return
            }
            assert.fail('Expected revet not received')
        })
    })
})
