import 'hardhat-deploy' // need this for ambient module declarations
import { config } from '@cream/config'
import hre from 'hardhat'
import { Keypair } from 'maci-domainobjs'
import {
  BALANCE,
  createCream4Testing,
  createMACI4Testing,
  createMaciState,
  coordinatorEdDSAKeypair,
  getNextBlockTimestamp,
  getUnnamedAccounts,
  setNextBlockTimestamp,
  buildLevel3LocalMerkleTree,
  buildProofWithLevel3VoteCircuit,
  buildStrBasedMaciProof,
  TestTreeDepths,
} from './test-utils'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

const { waffle } = require("hardhat");
const { toHex, createDeposit, pedersenHash, rbigInt } = require('libcream')

const ethers = (hre as any).ethers
const deployments = hre.deployments

export interface Voter {
  signer: SignerWithAddress
  keypair: Keypair
}

export interface BaseEnv {
  AccQueueQuinaryBlankSl: ContractFactory,
  AccQueueQuinaryMaci: ContractFactory,
  ConstantInitialVoiceCreditProxy: ContractFactory,
  Cream: ContractFactory,
  CreamFactory: ContractFactory,
  creamVerifier: Contract,
  Maci: ContractFactory,
  MaciFactory: ContractFactory,
  MessageAqFactory: ContractFactory,
  Poll: ContractFactory,
  PollDeployer: ContractFactory,
  PollFactory: ContractFactory,
  PollProcessorAndTallyer: ContractFactory,
  provider: any,
  signers: { [name: string]: SignerWithAddress },
  voteRecipients: SignerWithAddress[],
  SignUpToken: ContractFactory,
  SignUpTokenGatekeeper: ContractFactory,
  Verifier: ContractFactory,
  VkRegistry: ContractFactory,
  voterSigners: SignerWithAddress[],
  VotingToken: ContractFactory,
}

export const createBaseEnv: (options?: unknown) => Promise<BaseEnv> = deployments.createFixture(async () => {
  await deployments.fixture()
  const poseidon = await ethers.getContract('Poseidon')
  const poseidonT3 = await ethers.getContract('PoseidonT3')
  const poseidonT4 = await ethers.getContract('PoseidonT4')
  const poseidonT5 = await ethers.getContract('PoseidonT5')
  const poseidonT6 = await ethers.getContract('PoseidonT6')

  const VotingToken = await ethers.getContractFactory('VotingToken')
  const VkRegistry = await ethers.getContractFactory('VkRegistry')
  const PollDeployer = await ethers.getContractFactory('PollDeployer')
  const SignUpTokenGatekeeper = await ethers.getContractFactory(
    'SignUpTokenGatekeeper'
  )
  const SignUpToken = await ethers.getContractFactory('SignUpToken')

  const [
    contractOwner, coordinator,
    voter1, voter2,
    voteRecipient1, voteRecipient2, voteRecipient3, voteRecipient4, voteRecipient5,
  ] =
    await getUnnamedAccounts(hre)
  const signers = { contractOwner, coordinator }
  const voteRecipients = [ voteRecipient1, voteRecipient2, voteRecipient3, voteRecipient4, voteRecipient5 ]

  const ConstantInitialVoiceCreditProxy: ContractFactory = await ethers.getContractFactory(
    'ConstantInitialVoiceCreditProxy'
  )
  // const constantInitialVoiceCreditProxy =
  //   await ConstantInitialVoiceCreditProxy.deploy(
  //     config.maci.initialVoiceCreditBalance
  //   )
  const Cream: ContractFactory = await ethers.getContractFactory('Cream', {
    libraries: {
      Poseidon: poseidon.address,
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
  })
  const CreamFactory: ContractFactory = await ethers.getContractFactory('CreamFactory', {
    libraries: {
      Poseidon: poseidon.address,
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
  })
  const AccQueueQuinaryBlankSl: ContractFactory = await ethers.getContractFactory(
    'AccQueueQuinaryBlankSl',
    {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    }
  )
  const AccQueueQuinaryMaci: ContractFactory = await ethers.getContractFactory(
    'AccQueueQuinaryMaci',
    {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    }
  )
  const MaciFactory: ContractFactory = await ethers.getContractFactory('MACIFactory', {
    libraries: {
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
    signer: contractOwner,
  })
  const MessageAqFactory: ContractFactory = await ethers.getContractFactory(
    'MessageAqFactory',
    {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    }
  )
  const PollFactory: ContractFactory = await ethers.getContractFactory('PollFactory', {
    libraries: {
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
  })

  const Maci: ContractFactory = await ethers.getContractFactory('MACI', {
    libraries: {
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
  })
  const Poll: ContractFactory = await ethers.getContractFactory('Poll', {
    libraries: {
      PoseidonT3: poseidonT3.address,
      PoseidonT4: poseidonT4.address,
      PoseidonT5: poseidonT5.address,
      PoseidonT6: poseidonT6.address,
    },
  })

  const creamVerifier: Contract = await ethers.getContract('CreamVerifier')
  const voterSigners = [voter1, voter2] //, voter3, voter4, voter5]

  const Verifier: ContractFactory = await ethers.getContractFactory('Verifier')
  const PollProcessorAndTallyer: ContractFactory = await ethers.getContractFactory(
    'PollProcessorAndTallyer'
  )
  const provider = waffle.provider

  const baseEnv: BaseEnv = {
    AccQueueQuinaryBlankSl,
    AccQueueQuinaryMaci,
    Cream,
    CreamFactory,
    creamVerifier,
    ConstantInitialVoiceCreditProxy,
    Maci,
    MaciFactory,
    MessageAqFactory,
    Poll,
    PollDeployer,
    PollFactory,
    PollProcessorAndTallyer,
    provider,
    signers,
    voteRecipients,
    SignUpToken,
    SignUpTokenGatekeeper,
    Verifier,
    VkRegistry,
    voterSigners,
    VotingToken,
  }
  return baseEnv
})

export interface TestState {
  maci: Contract,
  cream: Contract,
  signUpToken: Contract,
  votingToken: Contract,
  maciState: any,
  maciStatePoll: any,
  emptyTally: bigint[],
  voters: Voter[],
}

// create MACI, MACIState and sign up to both
export const createInitialTestStateAndSignUp = async (
  B: BaseEnv,
  testTreeDepths: TestTreeDepths,
  votingDuration: number,
  messageBatchSize: number,
) => {
  const maxValues = {
    maxUsers: 10,
    maxMessages: 10,
    maxVoteOptions: 25,  // this must match w/ contract's maxValues counterpart
  }

  const signUpToken: Contract = await B.SignUpToken.deploy()

  const { maci: _maci } = await createMACI4Testing(
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
  const maci: Contract = _maci

  const maciPollAddr = await maci.getPoll(0)
  const maciPoll = await B.Poll.attach(maciPollAddr)
  const deployTimeDuration = await maciPoll.getDeployTimeAndDuration()
  const maciPollDeployTime = BigInt(deployTimeDuration[0])
  const maciPollVotingDuration = BigInt(deployTimeDuration[1])

  const maciState = createMaciState()

  const pollEndTimestamp: bigint = maciPollDeployTime + maciPollVotingDuration
  const pollId = maciState.deployPoll(
    maciPollVotingDuration,
    pollEndTimestamp,
    maxValues,
    testTreeDepths,
    messageBatchSize,
    coordinatorEdDSAKeypair
  )
  const maciStatePoll = maciState.polls[pollId]

  const votingToken: Contract = await B.VotingToken.deploy()

  const { cream: _cream } = await createCream4Testing(
    B.signers.coordinator,
    B.Cream,
    B.creamVerifier.address,
    B.Maci,
    _maci.address,
    3, // merkleTreeHeight // this needs to match w/ MACI's state tree height which in this test is 3
    B.signers.contractOwner, // owner signer
    config.maci.signUpDurationInSeconds,
    B.SignUpToken,
    signUpToken.address,
    B.voteRecipients,
    config.maci.votingDurationInSeconds,
    B.VotingToken,
    votingToken.address
  )
  const cream: Contract = _cream
  await signUpToken.transferOwnership(cream.address)

  // all votee initially has zero vote
  const emptyTally: bigint[] = []
  for (let i = 0; i < 5 ** testTreeDepths.voteOptionTreeDepth; i++) {
    emptyTally[i] = BigInt(0)
  }

  // create voters w/ keypair
  const voters: Voter[] = []
  for (const [i, voterSigner] of B.voterSigners.entries()) {
    voters.push({
      signer: voterSigner,
      keypair: new Keypair(),
    })
  }

  // let all voters sign up w/ MACI
  const localMerkleTree = buildLevel3LocalMerkleTree()

  for (const [i, voter] of voters.entries()) {
    // give voting token to voter
    await votingToken.giveToken(voter.signer.address)
    await votingToken
      .connect(voter.signer)
      .setApprovalForAll(cream.address, true)

    // create commitment for the voter and insert it to localMerkleTree
    const deposit = createDeposit(rbigInt(31), rbigInt(31))
    localMerkleTree.insert(deposit.commitment)

    // deposit voting token to cream
    await cream.connect(voter.signer).deposit(toHex(deposit.commitment))

    // merkle root after inserting user's commitment
    const root = localMerkleTree.root

    // get path to the root from the voter's leaf node
    const merkleProof = localMerkleTree.getPathUpdate(i)

    // input for generating proof of voter's vote
    const input = {
      root,
      nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
        .babyJubX,
      nullifier: deposit.nullifier,
      secret: deposit.secret,
      path_elements: merkleProof[0],
      path_index: merkleProof[1],
    }
    // create proof of vote
    const { proof } = await buildProofWithLevel3VoteCircuit(input)

    const args = [toHex(input.root), toHex(input.nullifierHash)]
    const voterPubKey = voter.keypair.pubKey.asContractParam()
    const strBasedMaciProof = buildStrBasedMaciProof(proof)

    // sign up timestamp must match in MACI and MACIState
    const timestamp = await getNextBlockTimestamp()
    await setNextBlockTimestamp(timestamp)

    await cream
      .connect(voter.signer)
      .signUpMaci(voterPubKey, strBasedMaciProof, ...args)

    maciState.signUp(
      voter.keypair.pubKey,
      BigInt(BALANCE),
      BigInt(timestamp)
    )
  }

  const testState: TestState = {
    maci,
    cream,
    signUpToken,
    votingToken,
    maciState,
    maciStatePoll,
    emptyTally,
    voters,
  }
  return testState
}