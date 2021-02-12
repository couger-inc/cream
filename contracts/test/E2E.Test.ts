const { config } = require('cream-config')
const { createDeposit, rbigInt } = require('libcream')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const { Keypair, PrivKey } = require('maci-domainobjs')

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
  let coordinator

  let votingToken
  let signUpToken
    let tx
    let creamAddress
    let cream
    let snapshotId
    let coordinatorPubKey

    let maciAddress
    let maci

    const LEVELS = config.cream.merkleTrees
    const RECIPIENTS = config.cream.recipients
    const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'
    const voter = accounts[1]
    const coordinatorAddress = accounts[2]

  before(async () => {
    // 1. contract owner deploy maci factory
    maciFactory = await MACIFactory.deployed()

    // 2. owner deploy cream factory
    creamFactory = await CreamFactory.deployed()

    // 3. owner transfer ownership from maci factory to cream factory
    await maciFactory.transferOwnership(creamFactory.address)

    // 4. coordinator provide a pubkey to owner
    coordinator = new Keypair(
        new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )

    // 5. owner also deploy both voting and sign up token
    votingToken = await VotingToken.deployed()
    signUpToken = await SignUpToken.deployed()

    // 6. owner deploy cream from cream factory
    tx = await creamFactory.createCream(
      votingToken.address,
      LEVELS,
      RECIPIENTS,
      IPFS_HASH,
      coordinator.pubKey.asContractParam(),
      coordinatorAddress,
      signUpToken.address
    )
    creamAddress = tx.logs[3].args[0]
    cream = await Cream.at(creamAddress)
    maciAddress = await cream.maci()

    maci = await MACI.at(maciAddress)


      snapshotId = await takeSnapshot()
    })
  // before() {
  //   6. transfer voting token to voters
  //   7. voters deposit
  //   8. voters signup
  //   9. voters publish message
  //  10. coordinator process messages
  //  11. coordinator prove vote tally
  //  12. coordinator create tally.json from tally command
  //  13. coordinator publish tally hash
  //  14. owner aprove tally
  //  15. coordinator withdraw deposits and transfer to recipient
  // }
    describe('E2E', () => {
        it('should correctly transfer voting token to recipient', () => {})
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
    })
})
