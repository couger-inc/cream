const { config } = require('cream-config')
const { MerkleTree } = require('cream-merkle-tree')
const { MaciState } = require('maci-core')
const { genRandomSalt, IncrementalQuinTree } = require('maci-crypto')
const {
    Keypair,
    StateLeaf,
    Command,
    PrivKey,
    PubKey,
} = require('maci-domainobjs')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const {
    createDeposit,
    rbigInt,
    toHex,
    pedersenHash,
    createMessage,
} = require('libcream')
const {
    genProofAndPublicSignals,
    unstringifyBigInts,
    genBatchUstProofAndPublicSignals,
} = require('cream-circuits')

const CreamVerifier = artifacts.require('CreamVerifier')
const MiMC = artifacts.require('MiMC')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')

const toHex32 = (number) => {
    let str = number.toString(16)
    while (str.length < 64) str = '0' + str
    return str
}

const toSolidityInput = (proof) => {
    return (
        '0x' +
        unstringifyBigInts([
            proof.pi_a[0],
            proof.pi_a[1],
            proof.pi_b[0][1],
            proof.pi_b[0][0],
            proof.pi_b[1][1],
            proof.pi_b[1][0],
            proof.pi_c[0],
            proof.pi_c[1],
        ])
            .map((x) => toHex32(x))
            .join('')
    )
}

contract('Maci(BatchProcessMessage)', (accounts) => {
    let tree
    let creamVerifier
    let mimc
    let tokenContract
    let cream
    let coordinatorPubKey
    let maciFactory
    let maciTx
    let maci
    let snapshotId
    const LEVELS = config.cream.merkleTrees.toString()
    const ZERO_VALUE = config.cream.zeroValue
    const value = config.cream.denomination.toString()
    const batchSize = config.maci.messageBatchSize // 4
    const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth // 4
    const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
    const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
    const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex

    const contractOwner = accounts[0]
    const coordinatorAddress = accounts[1]
    const coordinator = new Keypair(
        new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )

    const voters = []
    const users = []

    const maciState = new MaciState(
        coordinator,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        voteOptionsMaxIndex
    )

    let totalVotes = BigInt(0)
    let totalVoteWeight = BigInt(0)

    before(async () => {
        for (let i = 0; i < batchSize; i++) {
            voters.push(accounts[i + 2])
        }
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
        creamVerifier = await CreamVerifier.deployed()
        mimc = await MiMC.deployed()
        tokenContract = await SignUpToken.deployed()
        await Cream.link(MiMC, mimc.address)
        cream = await Cream.new(
            creamVerifier.address,
            tokenContract.address,
            value,
            LEVELS,
            config.cream.recipients,
            coordinatorAddress
        )
        maciFactory = await MACIFactory.deployed()
        maciTx = await maciFactory.deployMaci(
            cream.address,
            cream.address,
            coordinator.pubKey.asContractParam()
        )
        const maciAddress = maciTx.logs[2].args[0]
        await cream.setMaci(maciAddress)
        maci = await MACI.at(maciAddress)

        snapshotId = await takeSnapshot()
    })

    beforeEach(async () => {
        // for (let i = 0; i < voters.length; i++) {
        //
        // }
    })

    describe('batchProcessMessage', () => {
        // this test is ported from maci:
        // https://github.com/appliedzkp/maci/blob/master/contracts/ts/__tests__/BatchProcessMessageAndQuadVoteTally.test.ts
        beforeEach(async () => {
            for (let i = 0; i < voters.length; i++) {
                // deposit and signUpMaci
                const userKeypair = new Keypair()

                // create command per user
                const voteOptionIndex = 0
                const voiceCredits = BigInt(i)

                const command = new Command(
                    BigInt(i + 1),
                    userKeypair.pubKey,
                    BigInt(voteOptionIndex),
                    voiceCredits,
                    BigInt(1),
                    genRandomSalt()
                )

                const ephemeralKeypair = new Keypair()
                const signature = command.sign(userKeypair.privKey)
                const sharedKey = Keypair.genEcdhSharedKey(
                    ephemeralKeypair.privKey,
                    coordinator.pubKey
                )
                const message = command.encrypt(signature, sharedKey)

                users.push({
                    wallet: voters[i],
                    keypair: userKeypair,
                    ephemeralKeypair,
                    command,
                    message,
                })
            }

            for (const user of users) {
                const voteWeight = user.command.newVoteWeight
                totalVoteWeight += BigInt(voteWeight) * BigInt(voteWeight)
                totalVotes += voteWeight
            }
        })

        it('the blank state leaf hash should match the one generated by the contract', async () => {
            const temp = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))
            const emptyVoteOptionTreeRoot = temp.root
            const onChainHash = await maci.hashedBlankStateLeaf()
            const onChainRoot = await maci.emptyVoteOptionTreeRoot()
            const blankStateLeaf = StateLeaf.genBlankLeaf(
                emptyVoteOptionTreeRoot
            )
            assert.equal(
                onChainHash.toString(),
                blankStateLeaf.hash().toString()
            )
            assert.equal(
                onChainRoot.toString(),
                emptyVoteOptionTreeRoot.toString()
            )
        })

        it('should verify a proof and update the stateRoot', async () => {
            // check state root after users publishmessage()

            for (let i = 0; i < voters.length; i++) {
                await tokenContract.giveToken(voters[i])
                await tokenContract.setApprovalForAll(cream.address, true, {
                    from: voters[i],
                })

                const deposit = createDeposit(rbigInt(31), rbigInt(31))
                tree.insert(deposit.commitment)
                await cream.deposit(toHex(deposit.commitment), {
                    from: voters[i],
                })
                const root = tree.root
                const merkleProof = tree.getPathUpdate(i)
                const input = {
                    root,
                    nullifierHash: pedersenHash(
                        deposit.nullifier.leInt2Buff(31)
                    ).babyJubX,
                    nullifier: deposit.nullifier,
                    secret: deposit.secret,
                    path_elements: merkleProof[0],
                    path_index: merkleProof[1],
                }
                const { proof } = await genProofAndPublicSignals(
                    input,
                    'prod/vote.circom',
                    'build/vote.zkey',
                    'circuits/vote.wasm'
                )
                const args = [toHex(input.root), toHex(input.nullifierHash)]
                const userPubKey = users[i].keypair.pubKey.asContractParam()
                const proofForSolidityInput = toSolidityInput(proof)
                await cream.signUpMaci(
                    userPubKey,
                    proofForSolidityInput,
                    ...args,
                    { from: voters[i] }
                )
                maciState.signUp(
                    users[i].keypair.pubKey,
                    BigInt(config.maci.initialVoiceCreditBalance)
                )
            }

            // publishMessage
            for (const user of users) {
                maciState.publishMessage(
                    user.message,
                    user.ephemeralKeypair.pubKey
                )
                await maci.publishMessage(
                    user.message.asContractParam(),
                    user.ephemeralKeypair.pubKey.asContractParam()
                )
            }

            // check message root correctly updated
            const onChainMessageRoot = (
                await maci.getMessageTreeRoot()
            ).toString()
            const offChainMessageRoot = maciState.genMessageRoot().toString()

            assert.equal(onChainMessageRoot, offChainMessageRoot)

            // get circuit inputs
            const randomStateLeaf = StateLeaf.genRandomLeaf()
            const circuitInputs = maciState.genBatchUpdateStateTreeCircuitInputs(
                0,
                batchSize,
                randomStateLeaf
            )
            maciState.batchProcessMessage(0, batchSize, randomStateLeaf)

            const stateRootAfter = maciState.genStateRoot()

            console.log('Generating proof...')

            const ecdhPubKeys = []
            for (const p of circuitInputs['ecdh_public_key']) {
                const pubKey = new PubKey(p)
                ecdhPubKeys.push(pubKey)
            }

            const contractPublicSignals = await maci.genBatchUstPublicSignals(
                '0x' + stateRootAfter.toString(16),
                circuitInputs['state_tree_root'].map((x) => x.toString()),
                ecdhPubKeys.map((x) => x.asContractParam())
            )

            const {
                witness,
                proof,
                publicSignals,
            } = await genBatchUstProofAndPublicSignals(
                circuitInputs,
                config.env
            )

            // const stateRootAfter = maciState.genStateRoot()
            //
            // // Contract interaction
            // const tx = await maci.batchProcessMessage(
            // 	// newStateRoot
            // 	'0x' + stateRootAfter.toString(16),
            // 	// stateTreeRoots,
            // 	// ecdhPubKeys,
            // 	// proof,
            // 	{ from: coordinator }
            // )
        })
    })
})
