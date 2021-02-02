const { config } = require('cream-config')
const { MaciState } = require('maci-core')
const { IncrementalQuinTree } = require('maci-crypto')
const { Keypair, PrivKey } = require('maci-domainobjs')

const { revertSnapshot, takeSnapshot } = require('./TestUtil')

const SignUpToken = artifacts.require('SignUpToken')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')
const SignUpTokenGatekeeper = artifacts.require('SignUpTokenGatekeeper')
const ConstantInitialVoiceCreditProxy = artifacts.require(
    'ConstantInitialVoiceCreditProxy'
)

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

    const voters = []

    const maciState = new MaciState(
        coordinator,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        voteOptionsMaxIndex
    )

    before(async () => {
        for (let i = 0; i < batchSize; i++) {
            voters.push(accounts[i + 2])
        }
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

        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should have correct empty root values', async () => {
            const temp = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))
            const emptyVoteOptionTreeRoot = temp.root

            const root = await maci.emptyVoteOptionTreeRoot()
            assert.equal(emptyVoteOptionTreeRoot.toString(), root.toString())
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
    })
})
