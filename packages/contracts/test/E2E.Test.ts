const { config } = require('@cream/config')
const { MerkleTree } = require('cream-merkle-tree')
const {
    createDeposit,
    rbigInt,
    toHex,
    pedersenHash,
    createMessage,
    bnSqrt,
} = require('libcream')
const { genProofAndPublicSignals } = require('@cream/circuits')
const {
    formatProofForVerifierContract,
    timeTravel,
    getIpfsHash,
    getDataFromIpfsHash,
    RECIPIENTS,
    takeSnapshot,
    revertSnapshot,
} = require('./TestUtil')
const { Keypair, Command, PrivKey } = require('maci-domainobjs')
const { genRandomSalt } = require('maci-crypto')
const { processAndTallyWithoutProofs } = require('maci-cli')
const { MaciState } = require('maci-core')
const { BigNumber } = require('@ethersproject/bignumber')
const truffleAssert = require('truffle-assertions')
const fs = require('fs')

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
    describe('End-to-end tests', () => {
        let maciFactory
        let creamFactory
        let creamVerifier
        let votingToken
        let signUpToken
        let creamAddress
        let cream
        let maciAddress
        let maci
        let voteRecord = new Array(RECIPIENTS.length)
        let afterSetupSnapshot
        let tree

        const BALANCE = config.maci.initialVoiceCreditBalance
        const LEVELS = config.cream.merkleTrees
        const ZERO_VALUE = config.cream.zeroValue
        const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
        const batchSize = config.maci.messageBatchSize // 4
        const contractOwner = accounts[0]
        const coordinatorAddress = accounts[1]
        const coordinatorEthPrivKey =
            '0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f'
        const coordinator = new Keypair(
            new PrivKey(BigInt(config.maci.coordinatorPrivKey))
        )
        const voiceCredit_1 = 2 // bnSqrt(BigNumber.from(2)) = 0x01, BigNumber
        const voiceCredit_2 = 4 // bnSqrt(BigNumber.from(4)) = 0x02, BigNumber

        const setupEnvironment = async () => {
            // contract owner deploys maci factory
            maciFactory = await MACIFactory.deployed()

            // contract owner deploys cream factory
            creamFactory = await CreamFactory.deployed()

            // contract owner transfers ownership from maci factory to cream factory
            await maciFactory.transferOwnership(creamFactory.address)

            // contract owner deploys voting, sign-up token and creamVerifier
            creamVerifier = await CreamVerifier.deployed()
            votingToken = await VotingToken.deployed()
            signUpToken = await SignUpToken.deployed()

            // contract owner deploys cream from cream factory
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

            // transfer ownership of sign up token to cream
            await signUpToken.transferOwnership(cream.address)
        }

        const resetVotes = () => {
            tree = new MerkleTree(LEVELS, ZERO_VALUE)
            for (let i = 0; i < voteRecord.length; ++i) {
                voteRecord[i] = 0
            }
        }

        const signUp2Maci = async (voter, voterIndex, keypair) => {
            // give 1 voting token to voter
            await votingToken.giveToken(voter)
            await votingToken.setApprovalForAll(creamAddress, true, {
                from: voter,
            })

            // voter sends deposit the voting token to cream
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })

            // build proof that voter deposited the voting token
            const root = tree.root
            const merkleProof = tree.getPathUpdate(voterIndex)
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

            // ask cream to sign up to maci w/ the public key if the deposit proof is valid
            const voterPubKey = keypair.pubKey.asContractParam()
            const formattedProof = formatProofForVerifierContract(proof)
            await cream.signUpMaci(
                voterPubKey,
                formattedProof,
                toHex(input.root),
                toHex(input.nullifierHash),
                { from: voter }
            )
        }

        const getVoter = (voterIndex) => {
            return accounts[voterIndex + 2]
        }

        const letAllVoterSignUp2Maci = async (voterKeypairs) => {
            for (let i = 0; i < batchSize; ++i) {
                const voter = getVoter(i)
                await signUp2Maci(voter, i, voterKeypairs[i])
            }
        }

        const letAllVotersVote = async (
            voterKeypairs,
            voiceCredits,
            nonce,
            newVoterKeypairs
        ) => {
            for (let i = 0; i < batchSize; i++) {
                const voter = getVoter(i)
                const voiceCreditsBN = BigNumber.from(voiceCredits)
                const voiceCreditsSqrtNum = bnSqrt(voiceCreditsBN).toNumber()
                const voterKeypair = voterKeypairs[i]
                const newVoterKeypair = newVoterKeypairs
                    ? newVoterKeypairs[i]
                    : undefined

                // need this adjustment since batch size is bigger than the RECIPIENT size
                const voteRecipient = i % RECIPIENTS.length

                // create maci message to vote to voteRecipient
                const [message, encPubKey] = createMessage(
                    i + 1,
                    voterKeypair,
                    newVoterKeypair,
                    coordinator.pubKey,
                    voteRecipient,
                    voiceCreditsBN,
                    nonce,
                    genRandomSalt()
                )
                voteRecord[voteRecipient] += voiceCreditsSqrtNum

                // voter publishes vote message to maci
                await maci.publishMessage(
                    message.asContractParam(),
                    encPubKey.asContractParam(),
                    { from: voter }
                )
            }
        }

        const timeTravel2EndOfVotingPeriod = async () => {
            const duration = config.maci.signUpDurationInSeconds

            // time travel to the end of sign-up period
            await timeTravel(duration)

            // time travel to the end of voting period
            await timeTravel(duration)
        }

        const tally = async () => {
            const tally_file = 'build/tally.json'
            let tally
            try {
                // coordinator
                // - processes messages
                // - proves vote tally
                // - create tally result
                tally = await processAndTallyWithoutProofs({
                    contract: maciAddress,
                    eth_privkey: coordinatorEthPrivKey,
                    privkey: coordinator.privKey.serialize(),
                    tally_file,
                })
            } finally {
                if (fs.existsSync(tally_file)) {
                    fs.unlinkSync(tally_file)
                }
            }

            // coordinator publishes tally hash
            const tallyHash = await getIpfsHash(JSON.stringify(tally))
            await cream.publishTallyHash(tallyHash, {
                from: coordinatorAddress,
            })
            // contract owner approves tally
            await cream.approveTally({ from: contractOwner })
        }

        const getTallyResult = async () => {
            const hash = await cream.tallyHash()
            const result = await getDataFromIpfsHash(hash)
            const tallyResult = JSON.parse(result).results.tally.map((x) =>
                Number(x)
            )
            return tallyResult
        }

        before(async () => {
            await setupEnvironment()
            afterSetupSnapshot = await takeSnapshot()
        })

        beforeEach(async () => {
            resetVotes()
        })

        afterEach(async () => {
            await revertSnapshot(afterSetupSnapshot.result)
            afterSetupSnapshot = await takeSnapshot()
        })

        describe('Chainging key pair', () => {
            it('should ignore overriding message w/ old key pair', async () => {
                const voterKeypairs = [...Array(batchSize)].map(
                    (_) => new Keypair()
                )
                await letAllVoterSignUp2Maci(voterKeypairs)

                // 1. vote 1 voice credit w/ original key pair
                await letAllVotersVote(
                    voterKeypairs,
                    voiceCredit_1,
                    3,
                    undefined
                )

                const newVoterKeypairs = [...Array(batchSize)].map(
                    (_) => new Keypair()
                )
                // 2. vote 1 voice credit w/ new key pair
                await letAllVotersVote(
                    voterKeypairs,
                    voiceCredit_1,
                    2,
                    newVoterKeypairs
                )

                // 3. vote 2 voice credits w/ original currently invalid key pair
                await letAllVotersVote(
                    voterKeypairs,
                    voiceCredit_2,
                    1,
                    undefined
                )

                await timeTravel2EndOfVotingPeriod()
                await tally()
                const tallyResult = await getTallyResult()

                const expected = [2, 1, 1] //  3rd vote should have been rejected
                const actual = tallyResult.slice(0, RECIPIENTS.length)
                assert.deepEqual(actual, expected)
            })

            it('should accept overriding message w/ current key pair', async () => {
                const voterKeypairs = [...Array(batchSize)].map(
                    (_) => new Keypair()
                )
                await letAllVoterSignUp2Maci(voterKeypairs)

                // 1. vote 1 voice credit w/ original key pair
                await letAllVotersVote(
                    voterKeypairs,
                    voiceCredit_1,
                    3,
                    undefined
                )

                const newVoterKeypairs = [...Array(batchSize)].map(
                    (_) => new Keypair()
                )
                // 2. vote 1 voice credit w/ new key pair
                await letAllVotersVote(
                    voterKeypairs,
                    voiceCredit_1,
                    2,
                    newVoterKeypairs
                )

                // 3. vote 2 voice credit w/ current-valid key pair to override the previous vote
                await letAllVotersVote(
                    voterKeypairs,
                    voiceCredit_2,
                    1,
                    newVoterKeypairs
                )

                await timeTravel2EndOfVotingPeriod()
                await tally()
                const tallyResult = await getTallyResult()

                const expected = [4, 2, 2] // 3rd vote should have been accepted
                const actual = tallyResult.slice(0, RECIPIENTS.length)
                assert.deepEqual(actual, expected)
            })
        })

        it('should have processed all messages as valid messages', async () => {
            const voterKeypairs = [...Array(batchSize)].map(
                (_) => new Keypair()
            )
            await letAllVoterSignUp2Maci(voterKeypairs)
            await letAllVotersVote(voterKeypairs, voiceCredit_1, 1, undefined)
            await timeTravel2EndOfVotingPeriod()
            await tally()
            const tallyResult = await getTallyResult()

            const expected = voteRecord
            const actual = tallyResult.slice(0, RECIPIENTS.length)
            assert.deepEqual(actual, expected)
        })

        it('should correctly transfer voting token to recipient', async () => {
            const voterKeypairs = [...Array(batchSize)].map(
                (_) => new Keypair()
            )
            await letAllVoterSignUp2Maci(voterKeypairs)
            await letAllVotersVote(voterKeypairs, voiceCredit_1, 1, undefined)
            await timeTravel2EndOfVotingPeriod()
            await tally()
            const tallyResult = await getTallyResult()

            // coordinator withdraws deposits and transfer them to each recipient
            for (let i = 0; i < RECIPIENTS.length; i++) {
                // coordintor transfer tokens voted to recipient currently owned by cream to recipient
                const counts = tallyResult[i]
                for (let j = 0; j < counts; j++) {
                    const tx = await cream.withdraw(i, {
                        from: coordinatorAddress,
                    })
                    truffleAssert.eventEmitted(tx, 'Withdrawal')
                }

                // check if number of token voted matches w/ recipient token balance
                const numTokens = await votingToken.balanceOf(RECIPIENTS[i])
                assert.equal(tallyResult[i], numTokens.toString())
            }
        })
    })
})
