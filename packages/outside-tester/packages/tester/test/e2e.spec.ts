import { expect } from 'chai'
import { Keypair } from 'maci-domainobjs'
import {
  BaseEnv,
  createBaseEnv,
  createInitialTestStateAndSignUp,
  TestState,
} from './shared'
import {
  coordinatorEdDSAKeypair,
  TestTreeDepths,
  getNextBlockTimestamp,
  setNextBlockTimestamp,
  expectSingleEvent,
} from './test-utils'
import {
  genRandomSalt,
} from 'maci-crypto'
import IPFS from 'ipfs-http-client'

const { config } = require('@cream/config')
const { BigNumber } = require('@ethersproject/bignumber')
const {
  createMessage,
  bnSqrt,
} = require('libcream')

const ipfs = IPFS()

const getIpfsHash = async (s: string) => {
  const res = await ipfs.add(s)
  return res.path.toString()
}

const getDataFromIpfsHash = async (hash: string) => {
  const stream = ipfs.cat(hash)
  let data = ''
  for await (const chunk of stream) {
      data += chunk.toString()
  }
  return data
}

const { genMaciStateFromContract } = require('maci-contracts');

// using messageTree depths that are large enough to store all messages in tests
const testTreeDepths: TestTreeDepths = {
  messageTreeDepth: 3, // config.maci.merkleTrees.messageTreeDepth + 1,
  messageTreeSubDepth: 2, // config.maci.merkleTrees.messageTreeSubDepth + 1,
  voteOptionTreeDepth: config.maci.merkleTrees.voteOptionTreeDepth,
  stateTreeDepth: config.maci.merkleTrees.stateTreeDepth,
  intStateTreeDepth: config.maci.merkleTrees.intStateTreeDepth,
}
const votingDuration = config.maci.votingDurationInSeconds
const messageBatchSize = config.maci.messageBatchSize

const pollId = 0
const oneVoiceCredit= 2 // bnSqrt(BigNumber.from(2)) = 0x01, BigNumber
const twoVoiceCredits = 4 // bnSqrt(BigNumber.from(4)) = 0x02, BigNumber
const threeVoiceCredits = 9 // bnSqrt(BigNumber.from(9)) = 0x03, BigNumber

const letAllVotersVote = async (
  B: BaseEnv,
  S: TestState,
  voiceCredits: any,
  nonce: number,
  newKeypairs?: Keypair[],
) => {
  const maciPollAddr = await S.maci.getPoll(pollId)
  const maciPoll = await B.Poll.attach(maciPollAddr)

  for(const [i, voter] of S.voters.entries()) {
    const voiceCreditsBN = BigNumber.from(voiceCredits)

    const [message, encPubKey] = createMessage(
      i + 1,
      voter.keypair,
      newKeypairs ? newKeypairs[i] : null,
      coordinatorEdDSAKeypair.pubKey,
      i,  // voteOptionIndex
      voiceCreditsBN,
      pollId,
      nonce,
      genRandomSalt(),
    )

    // voter publishes vote message to maci
    await maciPoll.publishMessage(
      message.asContractParam(),
      encPubKey.asContractParam(),
    )
  }
}

const endVotingPeriod = async () => {
  // end the voting period
  const nextTimestamp = await getNextBlockTimestamp()
  await setNextBlockTimestamp(nextTimestamp + votingDuration)
}

const tally = async (B: BaseEnv, S: TestState) => {
  const maciPollAddr = await S.maci.getPoll(0)
  const maciPoll = await B.Poll.attach(maciPollAddr)
  await maciPoll.mergeMessageAqSubRoots(0)
  await maciPoll.mergeMessageAq()

  const maciState = await genMaciStateFromContract(
    B.signers.contractOwner.provider,
    S.maci.address,
    coordinatorEdDSAKeypair,
    0,
  )
  ;(BigInt.prototype as any).toJSON = function() { return this.toString(); };

  const maciStatePoll = maciState.polls[pollId]
  //maciStatePoll.mergeAllMessages()
  maciStatePoll.processMessages(0)
  maciStatePoll.tallyVotes()

  const tallyResultStr = JSON.stringify(maciStatePoll.results.map((x: string) => Number(x)))

  // coordinator publishes tally hash
  const tallyResultHash = await getIpfsHash(tallyResultStr)

  await S.cream.connect(B.signers.coordinator).publishTallyHash(tallyResultHash)

  // contract owner approves tally
  await S.cream.connect(B.signers.contractOwner).approveTally()
}

const getTallyResult: (S: TestState) => Promise<number[]> = async (S: TestState) => {
  const hash = await S.cream.tallyHash()
  const result = await getDataFromIpfsHash(hash)
  const tallyResult = JSON.parse(result) as number[]
  return tallyResult
}

describe('End-to-end tests', () => {
  describe('changing key pair and tally', () => {
    let S: TestState
    let B: BaseEnv

    beforeEach(async function () {
      B = await createBaseEnv()
      this.timeout(60000)
      S = await createInitialTestStateAndSignUp(
        B, testTreeDepths, votingDuration, messageBatchSize
      )
    })

    it('should ignore messages using old key pair', async () => {
      // vote 1 voice credit w/ original key pair
      await letAllVotersVote(B, S, oneVoiceCredit, 3)

      // renew key pair
      const newKeypairs = S.voters.map(_ => new Keypair())

      // vote 2 voice credits w/ new key pair. this should invalidate previous batch of votes
      await letAllVotersVote(B, S, twoVoiceCredits, 2, newKeypairs)

      // vote 3 voice credits w/ old key pair. this should be ignored
      await letAllVotersVote(B, S, twoVoiceCredits, 1)

      await endVotingPeriod()

      await tally(B, S)
      const tallyResult = await getTallyResult(S)

      const expected = [2, 2, 0, 0, 0] //  3rd batch of votes should have been rejected
      const actual = tallyResult.slice(0, B.voteRecipients.length)
      expect(actual).to.deep.equal(expected)
    })

    it('should ignore messages using old key pair and overridden messages',async () => {
      // vote 1 voice credit w/ original key pair
      await letAllVotersVote(B, S, oneVoiceCredit, 3)

      // renew key pair
      const newKeypairs = S.voters.map(_ => new Keypair())

      // vote 2 voice credits w/ new key pair. this should invalidate previous batch of votes
      await letAllVotersVote(B, S, twoVoiceCredits, 2, newKeypairs)

      // vote 2 voice credit w/ new key pair. this should override the previous batch of votes
      await letAllVotersVote(B, S, threeVoiceCredits, 1, newKeypairs)

      await endVotingPeriod()

      await tally(B, S)
      const tallyResult = await getTallyResult(S)

      const expected = [3, 3, 0, 0, 0] // 3rd batch of votes should be the noly one in effect
      const actual = tallyResult.slice(0, B.voteRecipients.length)
      expect(actual).to.deep.equal(expected)
    })

    it('should not ignore any messages when key pair remains the same and there is no overriding messages', async () => {
      await letAllVotersVote(B, S, oneVoiceCredit, 1)

      await endVotingPeriod()

      await tally(B, S)
      const tallyResult = await getTallyResult(S)

      const expected = [1, 1, 0, 0, 0]
      const actual = tallyResult.slice(0, B.voteRecipients.length)
      expect(actual).to.deep.equal(expected)
    })
  })
})

describe('transferring voting token to recipents', () => {
  let S: TestState
  let B: BaseEnv

  before(async function () {
    this.timeout(60000)
    B = await createBaseEnv()
    S = await createInitialTestStateAndSignUp(
      B, testTreeDepths, votingDuration, messageBatchSize
    )
  })

  it('should transfer all voting tokens correctly to recipients', async () => {
    await letAllVotersVote(B, S, oneVoiceCredit, 1)
    await endVotingPeriod()
    await tally(B, S)
    const tallyResult = await getTallyResult(S)

    // coordinator withdraws deposits and transfer them to each recipient
    for (let i = 0; i < B.voteRecipients.length; i++) {
      // coordinator transfer tokens voted to recipient currently owned by cream to recipient
      const counts = tallyResult[i]
      for (let j = 0; j < counts; j++) {
        const tx = await S.cream.connect(B.signers.coordinator).withdraw(i)
        await expectSingleEvent(tx, "Withdrawal")
      }

      // check if number of token voted matches w/ recipient token balance
      const numTokens = await S.votingToken.balanceOf(B.voteRecipients[i].address)
      expect(tallyResult[i]).to.equal(numTokens)
    }
  })
})
