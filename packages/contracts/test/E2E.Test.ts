const { config } = require('@cream/config')
const { MerkleTree } = require('cream-merkle-tree')
const {
    createDeposit,
    rbigInt,
    toHex,
    pedersenHash,
    createMessage,
} = require('libcream')
const { genProofAndPublicSignals } = require('@cream/circuits')
const {
    formatProofForVerifierContract,
    timeTravel,
    getIpfsHash,
    getDataFromIpfsHash,
    RECIPIENTS,
} = require('./TestUtil')
const { Keypair, Command, PrivKey } = require('maci-domainobjs')
const { genRandomSalt } = require('maci-crypto')
const { processMessages: processCmd, tally: tallyCmd } = require('maci-cli')
const { MaciState } = require('maci-core')
const { BigNumber } = require('@ethersproject/bignumber')
const truffleAssert = require('truffle-assertions')

const MACIFactory = artifacts.require('MACIFactory')
const CreamFactory = artifacts.require('CreamFactory')
const CreamVerifier = artifacts.require('CreamVerifier')
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
    let creamVerifier
    let votingToken
    let signUpToken
    let creamAddress
    let cream
    let maciAddress
    let maci
    let totalVotes = BigInt(0)
    let totalVoteWeight = BigInt(0)
    let tally

    const BALANCE = config.maci.initialVoiceCreditBalance
    const LEVELS = config.cream.merkleTrees
    const ZERO_VALUE = config.cream.zeroValue
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const batchSize = config.maci.messageBatchSize // 4
    const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth // 4
    const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
    const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
    const voteOptionsMaxIndex = config.maci.voteOptionsMaxLeafIndex // 3
    const contractOwner = accounts[0]
    const coordinatorAddress = accounts[1]
    const coordinatorEthPrivKey =
        '0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f'
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

        // 5. owner also deploy voting, sign up token and creamVerifier
        creamVerifier = await CreamVerifier.deployed()
        votingToken = await VotingToken.deployed()
        signUpToken = await SignUpToken.deployed()

        // 6. owner deploy cream from cream factory
        const tx = await creamFactory.createCream(
            creamVerifier.address,
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

        // 7. transfer ownership of sign up token
        await signUpToken.transferOwnership(cream.address)

        // voter's action sequences
        for (let i = 0; i < batchSize - 2; i++) {
            const voter = accounts[i + 2]
            const userKeypair = new Keypair()
            const voiceCredits = BigNumber.from(2) // bnSqrt(BigNumber.from(2)) = 0x01, BigNumber
            const nonce = BigInt(1)

            const [message, encPubKey] = createMessage(
                BigInt(i + 1),
                userKeypair,
                null,
                coordinator.pubKey,
                BigInt(i),
                voiceCredits,
                nonce,
                genRandomSalt()
            )

            // count total votes for verifying tally
            // const voteWeight = command.newVoteWeight
            // totalVoteWeight += BigInt(voteWeight) * BigInt(voteWeight)
            // totalVotes += voteWeight

            voters.push({
                wallet: voter,
                keypair: userKeypair,
                ephemeralKeypair: encPubKey,
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

            // 10. voter sign up maci
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
                `${process.env.NODE_ENV}/vote.circom`,
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

            // 11. voter publish message
            await maci.publishMessage(
                message.asContractParam(),
                encPubKey.asContractParam(),
                { from: voter }
            )
            maciState.publishMessage(message, encPubKey)
        }

        //  12. coordinator process messages
        // fast forward in time
        const duration = config.maci.signUpDurationInSeconds
        await timeTravel(duration)

        // end voting period
        await timeTravel(duration)

        const randomStateLeaf = await processCmd({
            contract: maciAddress,
            eth_privkey: coordinatorEthPrivKey,
            privkey: coordinator.privKey.serialize(),
            repeat: true,
        })

        //  13. coordinator prove vote tally
        //  14. coordinator create tally.json from tally command
        tally = await tallyCmd({
            contract: maciAddress,
            eth_privkey: coordinatorEthPrivKey,
            privkey: coordinator.privKey.serialize(),
            repeat: true,
            current_results_salt: '0x0',
            current_total_vc_salt: '0x0',
            current_per_vo_vc_salt: '0x0',
            leaf_zero: randomStateLeaf,
        })

        //  15. coordinator publish tally hash
        const tallyHash = await getIpfsHash(JSON.stringify(tally))
        await cream.publishTallyHash(tallyHash, { from: coordinatorAddress })
        //  16. owner aprove tally
        await cream.approveTally({ from: contractOwner })
    })

    //  17. coordinator withdraw deposits and transfer to recipient
    describe('E2E', () => {
        it('should correctly transfer voting token to recipient', async () => {
            const hash = await cream.tallyHash()
            const result = await getDataFromIpfsHash(hash)
            const resultsArr = JSON.parse(result).results.tally

            for (let i = 0; i < RECIPIENTS.length && resultsArr[i] != 0; i++) {
                const counts = resultsArr[i]
                for (let j = 0; j < counts; j++) {
                    const tx = await cream.withdraw(i, {
                        from: coordinatorAddress,
                    })
                    truffleAssert.eventEmitted(tx, 'Withdrawal')
                }

                // check balance
                const numTokens = await votingToken.balanceOf(RECIPIENTS[i])
                assert.equal(resultsArr[i], numTokens.toString())
            }
        })
    })
})
