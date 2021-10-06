const { config } = require('@cream/config')
const { MerkleTree } = require('cream-merkle-tree')
const {
    MaciState,
    genTallyResultCommitment,
    genSpentVoiceCreditsCommitment,
    genPerVOSpentVoiceCreditsCommitment,
} = require('maci-core')
const {
    genRandomSalt,
    IncrementalQuinTree,
    hashLeftRight: poseidonHashLeftRight,
    hash5: poseidonHash5,
} = require('maci-crypto')
const {
    Keypair,
    StateLeaf,
    Command,
    PrivKey,
    PubKey,
} = require('maci-domainobjs')
const {
    formatProofForVerifierContract,
    timeTravel,
    RECIPIENTS,
} = require('./TestUtil')
const { createDeposit, rbigInt, toHex, pedersenHash } = require('libcream')
const {
    genProofAndPublicSignals,
    genBatchUstProofAndPublicSignals,
    genQvtProofAndPublicSignals,
    getSignalByName,
    verifyBatchUstProof,
    verifyQvtProof,
} = require('@cream/circuits')

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
    let stateRootBefore

    const BALANCE = config.maci.initialVoiceCreditBalance
    const LEVELS = config.cream.merkleTrees
    const ZERO_VALUE = config.cream.zeroValue
    const batchSize = config.maci.messageBatchSize // 4
    const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth // 4
    const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
    const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
    const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex // 3
    const quadVoteTallyBatchSize = config.maci.quadVoteTallyBatchSize // 4

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

    let totalVotes = BigInt(0)
    let totalVoteWeight = BigInt(0)
    let newPerVOSpentVoiceCreditsSalt
    let perVOSpentVoiceCredits = []

    const emptyTally = []
    for (let i = 0; i < 5 ** voteOptionTreeDepth; i++) {
        emptyTally[i] = BigInt(0)
    }

    before(async () => {
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
        creamVerifier = await CreamVerifier.deployed()
        mimc = await MiMC.deployed()
        votingToken = await VotingToekn.deployed()
        await Cream.link(MiMC, mimc.address)
        cream = await Cream.new(
            creamVerifier.address,
            votingToken.address,
            LEVELS,
            RECIPIENTS,
            coordinatorAddress
        )
        maciFactory = await MACIFactory.deployed()
        signUpToken = await SignUpToken.deployed()
        const signUpGatekeeper = await SignUpTokenGatekeeper.new(
            signUpToken.address
        )
        const ConstantinitialVoiceCreditProxy = await ConstantInitialVoiceCreditProxy.new(
            BALANCE
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

        for (let i = 0; i < batchSize - 2; i++) {
            // deposit
            const userKeypair = new Keypair()

            // create command per user
            const voiceCredits = BigInt(i)

            const command = new Command(
                BigInt(i + 1),
                userKeypair.pubKey,
                BigInt(i),
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

            voters.push({
                wallet: accounts[i + 2],
                keypair: userKeypair,
                ephemeralKeypair,
                command,
                message,
            })
        }

        let i = 0
        for (const voter of voters) {
            const voteWeight = voter.command.newVoteWeight
            totalVoteWeight += BigInt(voteWeight) * BigInt(voteWeight)
            totalVotes += voteWeight

            await votingToken.giveToken(voter.wallet)
            await votingToken.setApprovalForAll(cream.address, true, {
                from: voter.wallet,
            })

            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), {
                from: voter.wallet,
            })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(i++)
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
                `${process.env.NODE_ENV}/vote.circom`,
                'build/vote.zkey',
                'circuits/vote.wasm'
            )
            const args = [toHex(input.root), toHex(input.nullifierHash)]
            const userPubKey = voter.keypair.pubKey.asContractParam()
            const formattedProof = formatProofForVerifierContract(proof)
            await cream.signUpMaci(userPubKey, formattedProof, ...args, {
                from: voter.wallet,
            })
            maciState.signUp(voter.keypair.pubKey, BigInt(BALANCE))
        }
    })

    describe('signUpMaci', () => {
        it('should have same state root hash after signing up some voters', async () => {
            const onChainStateRoot = (await maci.getStateTreeRoot()).toString()
            const offChainStateRoot = maciState.genStateRoot().toString()
            assert.equal(onChainStateRoot, offChainStateRoot)
        })

        it('should own a SignUpToken', async () => {
            let i = 1
            for (const voter of voters) {
                const ownerOfToken = await signUpToken.ownerOf(i++)
                assert.equal(ownerOfToken, voter.wallet)
            }
        })
    })

    describe('Publish messages', () => {
        it('should have same message root after publishing message', async () => {
            stateRootBefore = maciState.genStateRoot()
            for (const voter of voters) {
                maciState.publishMessage(
                    voter.message,
                    voter.ephemeralKeypair.pubKey
                )
                await maci.publishMessage(
                    voter.message.asContractParam(),
                    voter.ephemeralKeypair.pubKey.asContractParam()
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

    describe('Tally votes', () => {
        let tally
        let newResultsSalt
        let newSpentVoiceCreditSalt

        it('should tally a batch votes', async () => {
            const startIndex = BigInt(0)

            tally = maciState.computeBatchVoteTally(
                startIndex,
                quadVoteTallyBatchSize
            )
            newResultsSalt = genRandomSalt()
            const currentResultSalt = BigInt(0)

            const currentSpentVoiceCreditsSalt = BigInt(0)
            newSpentVoiceCreditSalt = genRandomSalt()

            const currentPerVOSpentVoiceCreditsSalt = BigInt(0)
            newPerVOSpentVoiceCreditsSalt = genRandomSalt()

            const circuitInputs = maciState.genQuadVoteTallyCircuitInputs(
                startIndex,
                quadVoteTallyBatchSize,
                currentResultSalt,
                newResultsSalt,
                currentSpentVoiceCreditsSalt,
                newSpentVoiceCreditSalt,
                currentPerVOSpentVoiceCreditsSalt,
                newPerVOSpentVoiceCreditsSalt
            )
            console.log('Generating proof...')
            const {
                circuit,
                witness,
                proof,
                publicSignals,
            } = await genQvtProofAndPublicSignals(circuitInputs, config.env)

            const newResultsCommitmentOutput = getSignalByName(
                circuit,
                witness,
                'main.newResultsCommitment'
            )

            const newResultsCommitment = genTallyResultCommitment(
                tally,
                newResultsSalt,
                voteOptionTreeDepth
            )
            assert.equal(
                newResultsCommitmentOutput.toString(),
                newResultsCommitment.toString()
            )

            // Check the commitment to the total number of spent voice credits
            const newSpentVoiceCreditsCommitment = genSpentVoiceCreditsCommitment(
                totalVoteWeight,
                newSpentVoiceCreditSalt
            )

            const newSpentVoiceCreditsCommitmentOutput = getSignalByName(
                circuit,
                witness,
                'main.newSpentVoiceCreditsCommitment'
            )
            assert.equal(
                newSpentVoiceCreditsCommitmentOutput.toString(),
                newSpentVoiceCreditsCommitment.toString()
            )

            perVOSpentVoiceCredits = maciState.computeBatchPerVOSpentVoiceCredits(
                startIndex,
                quadVoteTallyBatchSize
            )
            // Check the commitment to the per vote option spent voice credits
            const newPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
                perVOSpentVoiceCredits,
                newPerVOSpentVoiceCreditsSalt,
                voteOptionTreeDepth
            )

            const newPerVOSpentVoiceCreditsCommitmentOutput = getSignalByName(
                circuit,
                witness,
                'main.newPerVOSpentVoiceCreditsCommitment'
            )

            assert.equal(
                newPerVOSpentVoiceCreditsCommitmentOutput.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString()
            )

            const contractPublicSignals = await maci.genQvtPublicSignals(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
                totalVotes.toString()
            )

            const currentSpentVoiceCreditsCommitment = genSpentVoiceCreditsCommitment(
                0,
                currentSpentVoiceCreditsSalt
            )
            const currentPerVOSpentVoiceCreditsCommitment = genPerVOSpentVoiceCreditsCommitment(
                emptyTally,
                currentPerVOSpentVoiceCreditsSalt,
                voteOptionTreeDepth
            )

            assert.equal(
                publicSignals[0].toString(),
                newResultsCommitment.toString()
            )
            assert.equal(
                publicSignals[1].toString(),
                newSpentVoiceCreditsCommitment.toString()
            )
            assert.equal(
                publicSignals[2].toString(),
                newPerVOSpentVoiceCreditsCommitmentOutput.toString()
            )
            assert.equal(publicSignals[3].toString(), totalVotes.toString())
            assert.equal(
                publicSignals[4].toString(),
                maciState.genStateRoot().toString()
            )
            assert.equal(publicSignals[5].toString(), '0')
            assert.equal(
                publicSignals[6].toString(),
                circuitInputs.intermediateStateRoot.toString()
            )
            assert.equal(
                publicSignals[7].toString(),
                circuitInputs.currentResultsCommitment.toString()
            )
            assert.equal(
                publicSignals[8].toString(),
                currentSpentVoiceCreditsCommitment.toString()
            )
            assert.equal(
                publicSignals[9].toString(),
                currentPerVOSpentVoiceCreditsCommitment.toString()
            )

            for (let i = 0; i < publicSignals.length; i++) {
                assert.equal(
                    publicSignals[i].toString(),
                    contractPublicSignals[i].toString()
                )
            }

            const isValid = await verifyQvtProof(
                proof,
                publicSignals,
                config.env
            )
            assert.isTrue(isValid)

            const formattedProof = formatProofForVerifierContract(proof)

            const tx = await maci.proveVoteTallyBatch(
                circuitInputs.intermediateStateRoot.toString(),
                newResultsCommitment.toString(),
                newSpentVoiceCreditsCommitment.toString(),
                newPerVOSpentVoiceCreditsCommitment.toString(),
                totalVotes.toString(),
                formattedProof
            )

            assert.isTrue(tx.receipt.status)
        })

        it('on-chain verification of the total number of spent voice credits', async () => {
            const result = await maci.verifySpentVoiceCredits(
                totalVoteWeight.toString(),
                newSpentVoiceCreditSalt.toString()
            )

            assert.isTrue(result)
        })

        it('on-chain tally result verification of one leaf', async () => {
            const tree = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))

            for (const t of tally) {
                tree.insert(t)
            }

            const expectedCommitment = poseidonHashLeftRight(
                tree.root,
                newResultsSalt
            )
            const currentResultsCommitment = await maci.currentResultsCommitment()

            assert.equal(
                expectedCommitment.toString(),
                currentResultsCommitment.toString()
            )

            const index = 0
            const leaf = tally[index]
            const proof = tree.genMerklePath(index)

            // Any contract can call the MACI contract's verifyTallyResult()
            // function to prove that they know the value of the leaf.
            const verified = await maci.verifyTallyResult(
                voteOptionTreeDepth,
                index,
                leaf.toString(),
                proof.pathElements.map((x) => x.map((y) => y.toString())),
                newResultsSalt.toString()
            )
            assert.isTrue(verified)
        })

        it('on-chain tally result verification of a batch of leaves', async () => {
            const depth = voteOptionTreeDepth - 1
            const tree = new IncrementalQuinTree(depth, BigInt(0))
            for (let i = 0; i < tally.length; i += 5) {
                const batch = poseidonHash5(tally.slice(i, i + 5))
                tree.insert(batch)
            }

            const index = 0
            const leaf = tree.leaves[index]
            const proof = tree.genMerklePath(index)

            // Any contract can call the MACI contract's verifyTallyResult()
            // function to prove that they know the value of a batch of leaves.
            const verified = await maci.verifyTallyResult(
                depth,
                index,
                leaf.toString(),
                proof.pathElements.map((x) => x.map((y) => y.toString())),
                newResultsSalt.toString()
            )
            assert.isTrue(verified)
        })

        it('on-chain per VO spent voice credit verification of one leaf', async () => {
            const tree = new IncrementalQuinTree(voteOptionTreeDepth, BigInt(0))
            for (const t of perVOSpentVoiceCredits) {
                tree.insert(t)
            }
            const expectedCommitment = poseidonHashLeftRight(
                tree.root,
                newPerVOSpentVoiceCreditsSalt
            )
            const currentPerVOSpentVoiceCreditsCommitment = await maci.currentPerVOSpentVoiceCreditsCommitment()
            assert(
                expectedCommitment.toString(),
                currentPerVOSpentVoiceCreditsCommitment.toString()
            )

            const index = 0
            const leaf = perVOSpentVoiceCredits[index]
            const proof = tree.genMerklePath(index)

            // Any contract can call the MACI contract's verifyTallyResult()
            // function to prove that they know the value of the leaf.
            const verified = await maci.verifyPerVOSpentVoiceCredits(
                voteOptionTreeDepth,
                index,
                leaf.toString(),
                proof.pathElements.map((x) => x.map((y) => y.toString())),
                newPerVOSpentVoiceCreditsSalt.toString()
            )
            assert.isTrue(verified)
        })
    })
})
