const { config } = require('cream-config')
const { MerkleTree } = require('cream-merkle-tree')
const { createDeposit, rbigInt, toHex, pedersenHash } = require('libcream')
const { genProofAndPublicSignals } = require('cream-circuits')
const { formatProofForVerifierContract, timeTravel } = require('./TestUtil')
const { Keypair, Command, PrivKey } = require('maci-domainobjs')
const { genRandomSalt } = require('maci-crypto')
const { MaciState } = require('maci-core')

const MACIFactory = artifacts.require('MACIFactory')
const CreamFactory = artifacts.require('CreamFactory')
const VotingToken = artifacts.require('VotingToken')
const SignUpToken = artifacts.require('SignUpToken')
const Cream = artifacts.require('Cream')
const MACI = artifacts.require('MACI')
const SignUpTokenGatekeeper = artifacts.require('SignUpTokenGatekeeper')
const ConstantInitialVoiceCreditProxy = artifacts.require(
    'ConstantInitialVoiceCreditProxy'
)

contract('E2E', (accounts) => {
    let maciFactory
    let creamFactory
    let votingToken
    let signUpToken
    let creamAddress
    let cream
    let maciAddress
    let maci
    let totalVotes = BigInt(0)
    let totalVoteWeight = BigInt(0)

    const BALANCE = config.maci.initialVoiceCreditBalance
    const LEVELS = config.cream.merkleTrees
    const RECIPIENTS = config.cream.recipients
    const ZERO_VALUE = config.cream.zeroValue
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
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
    const tree = new MerkleTree(LEVELS, ZERO_VALUE)
    const maciState = new MaciState(
        coordinator,
        stateTreeDepth,
        messageTreeDepth,
        voteOptionTreeDepth,
        voteOptionsMaxIndex
    )

    before(async () => {
        // 1. contract owner deploy maci factory
        maciFactory = await MACIFactory.deployed()

        // 2. owner deploy cream factory
        creamFactory = await CreamFactory.deployed()

        // 3. owner transfer ownership from maci factory to cream factory
        await maciFactory.transferOwnership(creamFactory.address)

        // 4. coordinator provide a pubkey to owner

        // 5. owner also deploy both voting and sign up token
        votingToken = await VotingToken.deployed()
        signUpToken = await SignUpToken.deployed()

        // 6. owner deploy cream from cream factory
        const tx = await creamFactory.createCream(
            votingToken.address,
            signUpToken.address,
            BALANCE,
            LEVELS,
            RECIPIENTS,
            IPFS_HASH,
            coordinator.pubKey.asContractParam(),
            coordinatorAddress
        )
        creamAddress = tx.logs[3].args[0]
        cream = await Cream.at(creamAddress)
        maciAddress = await cream.maci()
        maci = await MACI.at(maciAddress)

        // 7. transfer ownership of sign up token
        await signUpToken.transferOwnership(cream.address)

        for (let i = 0; i < batchSize - 2; i++) {
            const voter = accounts[i + 2]
            const userKeypair = new Keypair()

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

            // count total votes for verifying tally
            const voteWeight = command.newVoteWeight
            totalVoteWeight += BigInt(voteWeight) * BigInt(voteWeight)
            totalVotes += voteWeight

            const ephemeralKeypair = new Keypair()
            const signature = command.sign(userKeypair.privKey)
            const sharedKey = Keypair.genEcdhSharedKey(
                ephemeralKeypair.privKey,
                coordinator.pubKey
            )

            const message = command.encrypt(signature, sharedKey)

            voters.push({
                wallet: voter,
                keypair: userKeypair,
                ephemeralKeypair,
                command,
                message,
            })

            // 8. transfer voting token to each voter
            await votingToken.giveToken(voter)
            await votingToken.setApprovalForAll(creamAddress, true, {
                from: voter,
            })

            // 9. voter deposits
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })

            // 10. voter signup maci
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
            const userPubKey = userKeypair.pubKey.asContractParam()
            const formattedProof = formatProofForVerifierContract(proof)
            await cream.signUpMaci(userPubKey, formattedProof, ...args, {
                from: voter,
            })
            maciState.signUp(userKeypair.pubKey, BigInt(BALANCE))
        }
    })

    //  11. voters publish message
    //  12. coordinator process messages
    //  13. coordinator prove vote tally
    //  14. coordinator create tally.json from tally command
    //  15. coordinator publish tally hash
    //  16. owner aprove tally
    //  17. coordinator withdraw deposits and transfer to recipient

    describe('E2E', () => {
        it('should correctly transfer voting token to recipient', () => {})
    })
})
