import 'hardhat-deploy' // need this for ambient module declarations
import { config } from '@cream/config'
import hre from 'hardhat'
import { expect } from 'chai'
import { Keypair, Command, Ballot } from 'maci-domainobjs'
import {
  createMACI4Testing,
  createMaciState,
  coordinatorEdDSAKeypair,
  extractSingleEventArg1,
  getNextBlockTimestamp,
  setNextBlockTimestamp,
  TestTreeDepths,
  SnarkJsVKey,
  SnarkJsProof,
  buildMaciVerifyingKey,
  buildMaciProof,
} from './test-utils'
import {
  genRandomSalt,
  hash3,
  hash5,
  IncrementalQuinTree,
} from 'maci-crypto'
import {
  BaseEnv,
  createBaseEnv,
  createInitialTestStateAndSignUp,
  TestState,
} from './shared'

const fs = require('fs')
const util = require('util')
const childProcess = require('child_process')
const exec = util.promisify(childProcess.exec)

const testDir = `${__dirname}/../test-site`

let B: BaseEnv

before(async () => {
  B = await createBaseEnv()
})

// using configuration that processMessages_test.circom uses
const testTreeDepths: TestTreeDepths = {
  messageTreeDepth: 2,  // config.maci.merkleTrees.messageTreeDepth,
  messageTreeSubDepth: 1,  // config.maci.merkleTrees.messageTreeSubDepth,
  voteOptionTreeDepth: 2,  // config.maci.merkleTrees.voteOptionTreeDepth,
  stateTreeDepth: 10,  // config.maci.merkleTrees.stateTreeDepth,
  intStateTreeDepth: 1,  // config.maci.merkleTrees.intStateTreeDepth,
}
const votingDuration = config.maci.votingDurationInSeconds
const messageBatchSize = config.maci.messageBatchSize

// originally 'should verify a proof and update the stateRoot' in batchProcessMessages
// this test is ported from maci:
// https://github.com/appliedzkp/maci/blob/master/contracts/ts/__tests__/BatchProcessMessageAndQuadVoteTally.test.ts
describe('Process messages and tally', () => {
  describe('sign up, publish messages, process messages and tally votes', () => {
    let S: TestState

    before(async function () {
      this.timeout(60000)
      S = await createInitialTestStateAndSignUp(
        B, testTreeDepths, votingDuration, messageBatchSize
      )
    })

    describe('signUpMaci', () => {
      it('should own a SignUpToken', async () => {
        for (const [i, voter] of S.voters.entries()) {
          const ownerOfToken = await S.signUpToken.ownerOf(i + 1)
          expect(ownerOfToken).to.equal(voter.signer.address)
        }
      })

      // dropped since comparing roots requierd merging state tree which in turn requires
      // the voting period to be over, but publish messages needs to start during the voting
      // period and Hardhat doesn't allow to move back to past i.e. If we run this test, we
      // cannot run publish message test. Since publish message test should fail if this test
      // fails. It should be safe to drop this test.
      // it('should have same state root hash after signing up some voters', async () => {
      // })
    })

    /*
      This requires the following files to be in the working directory:
      - pm.zkey generated from r1cs (generated from processMessages_test.circom) and ptau
    */
    describe('Publish messages', () => {
      const compareMACIAndMACIStateRoots = async () => {
        const pollAddr = await S.maci.getPoll(0)
        const poll = await B.Poll.attach(pollAddr)
        await poll.mergeMaciStateAqSubRoots(0, 0)
        const tx = await poll.mergeMaciStateAq(0)
        const maciRoot = await extractSingleEventArg1(tx, 'MergeMaciStateAq')

        S.maciState.stateAq.mergeSubRoots(0)
        S.maciState.stateAq.merge(testTreeDepths.stateTreeDepth)
        const maciStateRoot = S.maciState.stateAq.getRoot(testTreeDepths.stateTreeDepth)

        expect(maciRoot).to.equal(maciStateRoot)
      }

      it('should have same message root after publishing message', async () => {
        const maciPollAddr = await S.maci.getPoll(0)
        const maciPoll = await B.Poll.attach(maciPollAddr)
        const baseTimestamp = await getNextBlockTimestamp()

        // for each voter, publish identical messages to both MACI and MACIState
        for (const [i, voter] of S.voters.entries()) {

          // create command
          const command = new Command(
            BigInt(i + 1), // stateIndex
            voter.keypair.pubKey, // newPubKey
            BigInt(i), // voteOptionIndex
            BigInt(i), // newVoteWeight
            BigInt(1), // nonce
            BigInt(0), // pollId
            genRandomSalt() // salt
          )

          // create message for the command
          const ephemeralKeypair = new Keypair()
          const signature = command.sign(voter.keypair.privKey)
          const sharedKey = Keypair.genEcdhSharedKey(
            ephemeralKeypair.privKey,
            coordinatorEdDSAKeypair.pubKey
          )
          const message = command.encrypt(signature, sharedKey)

          // publish the messagbe
          const timestamp = baseTimestamp + i
          await setNextBlockTimestamp(timestamp)
          await maciPoll.publishMessage(
            message.asContractParam(),
            ephemeralKeypair.pubKey.asContractParam()
          )
          S.maciStatePoll.publishMessage(
            message,
            ephemeralKeypair.pubKey
          )
        }

        // end the voting period
        const nextTimestamp = await getNextBlockTimestamp()
        await setNextBlockTimestamp(nextTimestamp + votingDuration)

        await compareMACIAndMACIStateRoots()
      })

      it('should be able to verify process messages proof w/ public input created from MACIState circuit inputs and other inputs from MACI Poll', async () => {
        S.maciStatePoll.mergeAllMessages()
        const pmCircuitInputs = S.maciStatePoll.processMessages(0)

        // write pm circuit inputs to file
        fs.writeFileSync(`${testDir}/pm-input.json`, JSON.stringify(pmCircuitInputs))

        // generate pm witness from the pm circuit input
        await exec(`cd ${testDir} && ./processMessages_test pm-input.json processMessages_test.wtns`)

        // write public input hash from circuit inputs to file
        const pmPublicInputHash = BigInt(pmCircuitInputs.inputHash)
        fs.writeFileSync(`${testDir}/pm-public-code.json`, JSON.stringify([pmPublicInputHash.toString()]))

        // generate proof
        await exec(`cd ${testDir} && snarkjs groth16 prove processMessages_test.zkey processMessages_test.wtns pm-proof.json pm-public.json`)

        const maciStateStateRoot = S.maciStatePoll.stateTree.root // maciState.stateAq.getRoot(stateTreeDepth)
        const maciStateBallotRoot = S.maciStatePoll.ballotTree.root

        // create new sbCommitment
        const maciPollAddr = await S.maci.getPoll(0)
        const maciPoll = await B.Poll.attach(maciPollAddr)

        const ciNewSbSalt = BigInt(pmCircuitInputs.newSbSalt)

        const newSbCommitmentSrc = [
          maciStateStateRoot,
          maciStateBallotRoot,
          ciNewSbSalt,
        ]
        const newSbCommitment = hash3(newSbCommitmentSrc)

        const verifier = await B.Verifier.deploy()
        const pollProcessorAndTallyer = await B.PollProcessorAndTallyer.deploy(verifier.address)

        const snarkJsPmProof = JSON.parse(fs.readFileSync(`${testDir}/pm-proof.json`)) as SnarkJsProof
        const pmProof = buildMaciProof(snarkJsPmProof)

        const snarkJsPmVKey = JSON.parse(fs.readFileSync(`${testDir}/processMessages_test.vkey`)) as SnarkJsVKey
        const pmVk = buildMaciVerifyingKey(snarkJsPmVKey)

        const snarkJsTallyVKey = JSON.parse(fs.readFileSync(`${testDir}/tallyVotes_test.vkey`)) as SnarkJsVKey
        const tallyVk = buildMaciVerifyingKey(snarkJsTallyVKey)

        await maciPoll.mergeMessageAqSubRoots(0)
        await maciPoll.mergeMessageAq()

        const extContractsAddrs = await maciPoll.extContracts()

        const vkRegistryAddr = extContractsAddrs[0]
        const vkRegistry = await B.VkRegistry.attach(vkRegistryAddr)

        vkRegistry.setVerifyingKeys(
          config.maci.merkleTrees.stateTreeDepth, //uint256 _stateTreeDepth,
          config.maci.merkleTrees.intStateTreeDepth, //uint256 _intStateTreeDepth,
          config.maci.merkleTrees.messageTreeDepth, //uint256 _messageTreeDepth,
          config.maci.merkleTrees.voteOptionTreeDepth,
          config.maci.messageBatchSize, // uint256 _messageBatchSize,
          pmVk.asContractParam(), //VerifyingKey memory _processVk,
          tallyVk.asContractParam(), //VerifyingKey memory _tallyVk
        )

        // also verifies the proof
        await pollProcessorAndTallyer.processMessages(
          maciPollAddr,
          newSbCommitment.toString(),
          pmProof,
        )

        ////////////////

        const tallyCircuitInputs = S.maciStatePoll.tallyVotes(0)

        // write pm circuit inputs to file
        fs.writeFileSync(`${testDir}/tally-input-code.json`, JSON.stringify(tallyCircuitInputs))

        // generate pm witness from the pm circuit input
        await exec(`cd ${testDir} && ./tallyVotes_test tally-input-code.json tallyVotes_test.wtns`)

        // // write public input hash from circuit inputs to file
        // const tallyPublicInputHash = BigInt(tallyCircuitInputs.inputHash)
        // fs.writeFileSync(`${testDir}/tally-public-code.json`, JSON.stringify([tallyPublicInputHash.toString()]))

        // generate proof
        await exec(`cd ${testDir} && snarkjs groth16 prove tallyVotes_test.zkey tallyVotes_test.wtns tally-proof.json tally-public.json`)

        const snarkJsTallyProof = JSON.parse(fs.readFileSync(`${testDir}/tally-proof.json`)) as SnarkJsProof
        const tallyProof = buildMaciProof(snarkJsTallyProof)

        await pollProcessorAndTallyer.tallyVotes(
          maciPollAddr,
          tallyCircuitInputs.newTallyCommitment.toString(),
          tallyProof,
        )
      })
    })
  })

  describe('batchProcessMessage', () => {
    // state leaf comparison part is dropped since blank state leaf cannot obtained from outside in v1
    it('should be that initial sbCommitment should match the one generated from empty Ballot', async () => {
      const signUpToken = await B.SignUpToken.deploy()

      // directly give signUpToken to voter bypassing cream.signUpMaci
      await signUpToken.giveToken(B.voterSigners[0].address)

      // from maci
      const { maci } = await createMACI4Testing(
        B.ConstantInitialVoiceCreditProxy,
        coordinatorEdDSAKeypair,
        B.Maci,
        B.MessageAqFactory,
        B.PollDeployer,
        B.PollFactory,
        signUpToken,
        B.SignUpTokenGatekeeper,
        testTreeDepths,
        B.VkRegistry,
        votingDuration
      )
      const pollAddr = await maci.getPoll(0)
      const poll = await B.Poll.attach(pollAddr)

      // end the voting period
      const endOfVotingPeriod = (await getNextBlockTimestamp()) + votingDuration
      await setNextBlockTimestamp(endOfVotingPeriod)

      await poll.mergeMaciStateAqSubRoots(0, 0)
      await poll.mergeMaciStateAq(0)
      const maciSbComm = await poll.currentSbCommitment()

      // from ballot
      const treeArity = 5
      const numVoteOptions = treeArity ** testTreeDepths.voteOptionTreeDepth
      const ballot = Ballot.genBlankBallot(numVoteOptions, testTreeDepths.voteOptionTreeDepth)
      const emptyLeaf = ballot.hash()
      const ballotTree = new IncrementalQuinTree(
        testTreeDepths.stateTreeDepth,
        emptyLeaf,
        5,
        hash5
      )
      const maciState = createMaciState()
      maciState.stateAq.mergeSubRoots(0)
      maciState.stateAq.merge(10)
      const maciStateRoot = maciState.stateAq.getRoot(10)
      const ballotSbComm = hash3([maciStateRoot, ballotTree.root, BigInt(0)])

      expect(maciSbComm.toString()).to.equal(ballotSbComm.toString())
    })
  })
})
