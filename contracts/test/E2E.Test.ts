const { config } = require('cream-config')
const { createDeposit, rbigInt } = require('libcream')
const { formatProofForVerifierContract, timeTravel } = require('./TestUtil')
const { Keypair, Command, PrivKey } = require('maci-domainobjs')
const { genRandomSalt } = require('maci-crypto')

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
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const batchSize = config.maci.messageBatchSize // 4
    const contractOwner = accounts[0]
    const coordinatorAddress = accounts[1]
    const coordinator = new Keypair(
        new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )
    const voters = []

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

        // 8. transfer voting token to voters
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

            await votingToken.giveToken(voter)
            await votingToken.setApprovalForAll(creamAddress, true, {
                from: voter,
            })
        }
    })

    //   9. voters deposit
    //  10. voters signup
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
