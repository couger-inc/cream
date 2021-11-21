import 'hardhat-deploy' // need this for ambient module declarations
import { config } from '@cream/config'
import hre from 'hardhat'
import { expect } from 'chai'
import { Keypair } from 'maci-domainobjs'
import {
  getUnnamedAccounts,
  extractSingleEventArg1,
  createMACI4Testing,
  createMaciState,
  coordinatorEdDSAKeypair,
  endVotingPeriod,
  expectSingleEvent,
} from './TestUtil'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import { AccQueue } from 'maci-crypto'

const messageTreeDepth = config.maci.merkleTrees.messageTreeDepth
const messageTreeSubDepth = config.maci.merkleTrees.messageTreeSubDepth
const voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth

const ethers = hre.ethers
const deployments = hre.deployments

/*
 * To make this app more loose coupling this test should work without Cream contract implementation
 */
describe('Maci SignUp', () => {
  const setupTest = deployments.createFixture(async () => {
    await deployments.fixture()

    const poseidonT3 = await ethers.getContract('PoseidonT3')
    const poseidonT4 = await ethers.getContract('PoseidonT4')
    const poseidonT5 = await ethers.getContract('PoseidonT5')
    const poseidonT6 = await ethers.getContract('PoseidonT6')
    const VkRegistry = await ethers.getContractFactory('VkRegistry')
    const PollDeployer = await ethers.getContractFactory('PollDeployer')
    const SignUpTokenGatekeeper = await ethers.getContractFactory(
      'SignUpTokenGatekeeper'
    )
    const SignUpToken = await ethers.getContractFactory('SignUpToken')

    const ConstantInitialVoiceCreditProxy = await ethers.getContractFactory(
      'ConstantInitialVoiceCreditProxy'
    )

    const AccQueueQuinaryBlankSl = await ethers.getContractFactory(
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

    const [contractOwner, user1, user2, user3] = await getUnnamedAccounts(hre)

    const MaciFactory = await ethers.getContractFactory('MACIFactory', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
      signer: contractOwner,
    })

    const _intStateTreeDepth = config.maci.merkleTrees.stateTreeDepth
    const _messageTreeSubDepth = 2
    const _messageTreeDepth = config.maci.merkleTrees.messageTreeDepth // 4
    const _voteOptionTreeDepth = config.maci.merkleTrees.voteOptionTreeDepth // 2
    const _signUpDuration = config.maci.signUpDurationInSeconds
    const _votingDuration = config.maci.votingDurationInSeconds

    const maciFactory = await MaciFactory.deploy(
      _intStateTreeDepth,
      _messageTreeSubDepth,
      _messageTreeDepth,
      _voteOptionTreeDepth,
      _signUpDuration,
      _votingDuration
    )

    const MessageAqFactory = await hre.ethers.getContractFactory(
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

    const PollFactory = await hre.ethers.getContractFactory('PollFactory', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    })

    const Maci = await ethers.getContractFactory('MACI', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    })
    const Poll = await ethers.getContractFactory('Poll', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    })

    return {
      signers: {
        contractOwner,
        user1,
        user2,
        user3,
      },
      Poll,
      Maci,
      maciFactory,
      ConstantInitialVoiceCreditProxy,
      SignUpTokenGatekeeper,
      AccQueueQuinaryBlankSl,
      MessageAqFactory,
      PollFactory,
      VkRegistry,
      PollDeployer,
      SignUpToken,
    }
  })

  let AccQueueQuinaryBlankSl: ContractFactory
  let ConstantInitialVoiceCreditProxy: ContractFactory
  let Maci: ContractFactory
  let MessageAqFactory: ContractFactory
  let Poll: ContractFactory
  let PollFactory: ContractFactory
  let PollDeployer: ContractFactory
  let signers: { [name: string]: SignerWithAddress }
  let SignUpToken: ContractFactory
  let signUpToken: Contract
  let SignUpTokenGatekeeper: ContractFactory
  let VkRegistry: ContractFactory

  const votingDuration = config.maci.votingDurationInSeconds
  const stateTreeDepth = config.maci.merkleTrees.stateTreeDepth

  interface User {
    wallet: string
    keypair: Keypair
  }

  let user1: User
  let user2: User
  let user3: User

  before(async () => {
    const {
      signers: _signers,
      maciFactory: _maciFactory,
      Maci: _Maci,
      Poll: _Poll,
      ConstantInitialVoiceCreditProxy: _ConstantInitialVoiceCreditProxy,
      AccQueueQuinaryBlankSl: _AccQueueQuinaryBlankSl,
      SignUpTokenGatekeeper: _SignUpTokenGatekeeper,
      MessageAqFactory: _MessageAqFactory,
      PollFactory: _PollFactory,
      VkRegistry: _VkRegistry,
      PollDeployer: _PollDeployer,
      SignUpToken: _SignUpToken,
    } = await setupTest()

    signers = _signers
    Poll = _Poll
    AccQueueQuinaryBlankSl = _AccQueueQuinaryBlankSl
    Maci = _Maci
    SignUpTokenGatekeeper = _SignUpTokenGatekeeper
    MessageAqFactory = _MessageAqFactory
    PollFactory = _PollFactory
    VkRegistry = _VkRegistry
    PollDeployer = _PollDeployer
    SignUpToken = _SignUpToken
    ConstantInitialVoiceCreditProxy = _ConstantInitialVoiceCreditProxy

    user1 = {
      wallet: signers.user1.address,
      keypair: new Keypair(),
    }
    user2 = {
      wallet: signers.user2.address,
      keypair: new Keypair(),
    }
    user3 = {
      wallet: signers.user3.address,
      keypair: new Keypair(),
    }
  })

  describe('initialize', () => {
    let maci: Contract
    let signUpToken: Contract

    before(async () => {
      const _signUpToken = await SignUpToken.deploy()

      const { maci: _maci } =
        await createMACI4Testing(
          ConstantInitialVoiceCreditProxy,
          coordinatorEdDSAKeypair,
          Maci,
          MessageAqFactory,
          messageTreeDepth,
          messageTreeSubDepth,
          PollDeployer,
          PollFactory,
          _signUpToken,
          SignUpTokenGatekeeper,
          stateTreeDepth,
          VkRegistry,
          voteOptionTreeDepth,
          votingDuration,
        )
      maci = _maci
      signUpToken = _signUpToken

      await signUpToken.giveToken(user1.wallet)
      await signUpToken.giveToken(user2.wallet)
    })

    it('should own a token', async () => {
      const ownerOfToken1 = await signUpToken.ownerOf(1)
      expect(ownerOfToken1).to.equal(user1.wallet)

      const ownerOfToken2 = await signUpToken.ownerOf(2)
      expect(ownerOfToken2).to.equal(user2.wallet)
    })

    it('should have correct empty stateAq root value', async () => {
      const stateTreeSubDepth = 2
      const BLANK_STATE_LEAF_HASH =
        BigInt(
          6769006970205099520508948723718471724660867171122235270773600567925038008762
        )

      const stateAq = new AccQueue(
        stateTreeSubDepth,
        5,
        BigInt(
          '6769006970205099520508948723718471724660867171122235270773600567925038008762'
        )
      )
      stateAq.enqueue(BLANK_STATE_LEAF_HASH)
      stateAq.mergeSubRoots()
      stateAq.merge(stateTreeDepth)
      const expectedRoot = stateAq.mainRoots[stateTreeDepth].toString()

      const accQueue = await AccQueueQuinaryBlankSl.deploy(stateTreeSubDepth)
      await accQueue.enqueue(BLANK_STATE_LEAF_HASH)
      await accQueue.mergeSubRoots(0)
      await accQueue.merge(stateTreeDepth)
      const actualRoot = await accQueue.getMainRoot(stateTreeDepth)

      expect(actualRoot.toString()).to.equal(expectedRoot.toString())
    })

    // dropped since currentResultsCommentment no longer exists in v1
    // it('should have correct currentResultsCommitment value', async () => {})

    // dropped since currentSpentVoiceCreditsCommentment no longer exists in v1
    // it('should have correct currentSpentVoiceCreditsCommitment value', async () => {})

    it('should have same state root value', async () => {
      await endVotingPeriod()

      const pollAddr = await maci.getPoll(0)
      const poll = await Poll.attach(pollAddr)
      await poll.mergeMaciStateAqSubRoots(0, 0)
      const tx = await poll.mergeMaciStateAq(0)
      const maciRoot = BigInt(
        await extractSingleEventArg1(tx, 'MergeMaciStateAq')
      )

      const maciState = createMaciState()
      maciState.stateAq.mergeSubRoots(0)
      maciState.stateAq.merge(stateTreeDepth)
      const maciStateRoot = maciState.stateAq.getRoot(stateTreeDepth)
      expect(maciStateRoot.toString()).to.equal(maciRoot.toString())
    })
  })

  describe('sign up', () => {
    let maci: Contract

    before(async () => {
      const _signUpToken = await SignUpToken.deploy()
      const { maci: _maci } =
        await createMACI4Testing(
          ConstantInitialVoiceCreditProxy,
          coordinatorEdDSAKeypair,
          Maci,
          MessageAqFactory,
          messageTreeDepth,
          messageTreeSubDepth,
          PollDeployer,
          PollFactory,
          _signUpToken,
          SignUpTokenGatekeeper,
          stateTreeDepth,
          VkRegistry,
          voteOptionTreeDepth,
          votingDuration,
        )
      maci = _maci
      signUpToken = _signUpToken

      await signUpToken.giveToken(user1.wallet)
      await signUpToken.giveToken(user2.wallet)
    })

    it('should revert if user does not own a SignUpToken', async () => {
      const f = maci
        .connect(signers.user2)
        .signUp(
          user3.keypair.pubKey.asContractParam(),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [0])
        )
      await expect(f).to.be.revertedWith(
        'SignUpTokenGatekeeper: this user does not own the token'
      )
    })

    it('should be able to sign up with SignUpToken', async () => {
      const timestamp = await endVotingPeriod()

      const tx = await maci
        .connect(signers.user1)
        .signUp(
          user1.keypair.pubKey.asContractParam(),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [0])
        )
      await expectSingleEvent(tx, 'SignUp')

      const pollAddr = await maci.getPoll(0)
      const poll = await Poll.attach(pollAddr)
      await poll.mergeMaciStateAqSubRoots(0, 0)
      const tx2 = await poll.mergeMaciStateAq(0)
      const maciRoot = BigInt(
        await extractSingleEventArg1(tx2, 'MergeMaciStateAq')
      )

      const maciState = createMaciState()
      maciState.signUp(
        user1.keypair.pubKey,
        BigInt(config.maci.initialVoiceCreditBalance),
        BigInt(timestamp)
      )
      maciState.stateAq.mergeSubRoots(0)
      maciState.stateAq.merge(stateTreeDepth)
      const maciStateRoot = maciState.stateAq.getRoot(stateTreeDepth)

      expect(maciStateRoot.toString()).to.equal(maciRoot.toString())
    })

    it('should revert if user uses to sign up with previously used SignUpToken', async () => {
      const f = maci
        .connect(signers.user1)
        .signUp(
          user1.keypair.pubKey.asContractParam(),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [1]),
          ethers.utils.defaultAbiCoder.encode(['uint256'], [0])
        )
      await expect(f).to.be.revertedWith(
        'SignUpTokenGatekeeper: this token has already been used to sign up'
      )
    })

    // voting period check no longer exists in MACI
    // Cream signUpMaci 'should reject after sign-up period is passed' replaces the test
    //it('should revert after sign up deadline', async () => {})
  })
})
