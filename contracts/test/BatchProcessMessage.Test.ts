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
const { revertSnapshot, takeSnapshot, timeTravel } = require('./TestUtil')
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
    getSignalByName,
    verifyBatchUstProof,
} = require('cream-circuits')

const CreamVerifier = artifacts.require('CreamVerifier')
const MiMC = artifacts.require('MiMC')
const VotingToekn = artifacts.require('VotingToken')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')
const SignUpTokenGatekeeper = artifacts.require('SignUpTokenGatekeeper')
const ConstantInitialVoiceCreditProxy = artifacts.require(
    'ConstantInitialVoiceCreditProxy'
)

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

const formatProofForVerifierContract = (_proof) => {
    return [
        _proof.pi_a[0],
        _proof.pi_a[1],
        _proof.pi_b[0][1],
        _proof.pi_b[0][0],
        _proof.pi_b[1][1],
        _proof.pi_b[1][0],
        _proof.pi_c[0],
        _proof.pi_c[1],
    ].map((x) => x.toString())
}

// this test is ported from maci:
// https://github.com/appliedzkp/maci/blob/master/contracts/ts/__tests__/BatchProcessMessageAndQuadVoteTally.test.ts
contract('Maci(BatchProcessMessage)', (accounts) => {
    let tree
    let creamVerifier
    let mimc
    let votingToken
    let signUpToken
    let cream
    let coordinatorPubKey
    let maciFactory
    let maciTx
    let maci
    let snapshotId
    let stateRootBefore

    const LEVELS = config.cream.merkleTrees.toString()
    const ZERO_VALUE = config.cream.zeroValue
    const value = config.cream.denomination.toString()
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
        votingToken = await VotingToekn.deployed()
        await Cream.link(MiMC, mimc.address)
        cream = await Cream.new(
            creamVerifier.address,
            votingToken.address,
            value,
            LEVELS,
            config.cream.recipients,
            coordinatorAddress
        )
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
        await signUpToken.transferOwnership(cream.address)
        await cream.setMaci(maciAddress, signUpToken.address, {
            from: accounts[0],
        })
        maci = await MACI.at(maciAddress)

        for (let i = 0; i < voters.length; i++) {
            // deposit
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

        for (let i = 0; i < voters.length; i++) {
            await votingToken.giveToken(voters[i])
            await votingToken.setApprovalForAll(cream.address, true, {
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
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
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
            await cream.signUpMaci(userPubKey, proofForSolidityInput, ...args, {
                from: voters[i],
            })
            maciState.signUp(
                users[i].keypair.pubKey,
                BigInt(config.maci.initialVoiceCreditBalance)
            )
        }

        snapshotId = await takeSnapshot()
    })

    describe('signUpMaci', () => {
        it('should have same state root hash after signing up some users', async () => {
            const onChainStateRoot = (await maci.getStateTreeRoot()).toString()
            const offChainStateRoot = maciState.genStateRoot().toString()
            assert.equal(onChainStateRoot, offChainStateRoot)
        })

        it('should own a SignUpToken', async () => {
            for (let i = 0; i < voters.length; i++) {
                const ownerOfToken = await signUpToken.ownerOf(i + 1)
                assert.equal(ownerOfToken, voters[i])
            }
        })
    })

    describe('Publish messages', () => {
        it('should have same message root after publishing message', async () => {
            stateRootBefore = maciState.genStateRoot()
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

            const onChainMessageRoot = (
                await maci.getMessageTreeRoot()
            ).toString()
            const offChainMessageRoot = maciState.genMessageRoot().toString()
            assert.equal(onChainMessageRoot, offChainMessageRoot)
        })
    })

    describe('batchProcessMessage', () => {
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
            // fast forward in time
            const duration = config.maci.signUpDurationInSeconds
            await timeTravel(duration)

            for (const user of users) {
                await maci.publishMessage(
                    user.message.asContractParam(),
                    user.ephemeralKeypair.pubKey.asContractParam()
                )
            }

            // end voting period
            await timeTravel(duration)

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
                circuit,
                witness,
                proof,
                publicSignals,
            } = await genBatchUstProofAndPublicSignals(
                circuitInputs,
                config.env
            )
            const circuitNewStateRoot = getSignalByName(
                circuit,
                witness,
                'main.root'
            )
            assert.notEqual(
                stateRootBefore.toString(),
                stateRootAfter.toString()
            )
            assert.equal(
                circuitNewStateRoot.toString(),
                stateRootAfter.toString()
            )
            const isValid = await verifyBatchUstProof(
                proof,
                publicSignals,
                config.env
            )
            assert.isTrue(isValid)
            assert.lengthOf(publicSignals, 20)

            for (let i = 0; i < publicSignals.length; i++) {
                assert.equal(
                    publicSignals[i].toString(),
                    contractPublicSignals[i].toString()
                )
            }
            const formattedProof = formatProofForVerifierContract(proof)

            await maci.batchProcessMessage(
                '0x' + stateRootAfter.toString(16),
                circuitInputs['state_tree_root'].map((x) => x.toString()),
                ecdhPubKeys.map((x) => x.asContractParam()),
                formattedProof,
                { from: coordinatorAddress }
            )

            const stateRoot = await maci.stateRoot()
            assert.equal(stateRoot.toString(), stateRootAfter.toString())
        })
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
    })
})
