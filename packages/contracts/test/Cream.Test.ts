import 'hardhat-deploy' // need this for ambient module declarations
import { config } from '@cream/config'
import hre from 'hardhat'
import { expect } from 'chai'
import { Keypair, PrivKey } from 'maci-domainobjs'
import {
  buildMaciProof,
  buildMerkleTree4VoteCircuit,
  buildVoteCircuitProof,
  coordinatorEdDSAKeypair,
  expectSingleEvent,
  extractEvents,
  extractSingleEventArg1,
  getNextBlockTimestamp,
  getUnnamedAccounts,
  LEVELS,
  prepare4VoteCircuitTests,
  setNextBlockTimestamp,
  stringifyBigInts,
  verifyVoteCircuitProof,
} from './TestUtil'
import { VoteCircuitInputs } from '@cream/circuits'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import { toBN, randomHex } from 'web3-utils'

const {
  bigInt,
  toHex,
  createDeposit,
  createMessage,
  pedersenHash,
  rbigInt,
} = require('libcream')

describe('Cream', () => {
  const signUpDuration = config.maci.signUpDurationInSeconds
  const votingDuration = config.maci.votingDurationInSeconds

  const ethers = hre.ethers
  const deployments = hre.deployments

  const setupTest = deployments.createFixture(async () => {
    await deployments.fixture()

    const poseidon = await ethers.getContract('Poseidon')
    const poseidonT3 = await ethers.getContract('PoseidonT3')
    const poseidonT4 = await ethers.getContract('PoseidonT4')
    const poseidonT5 = await ethers.getContract('PoseidonT5')
    const poseidonT6 = await ethers.getContract('PoseidonT6')
    const creamVerifier = await ethers.getContract('CreamVerifier')
    const votingToken = await ethers.getContract('VotingToken')
    const maciFactory = await ethers.getContract('MACIFactory')

    const [
      contractOwner,
      coordinator,
      voter,
      voter2,
      badUser,
      recipient1,
      recipient2,
      recipient3,
    ] = await getUnnamedAccounts(hre)
    const recipients = [
      recipient1.address,
      recipient2.address,
      recipient3.address,
    ]

    const Cream = await hre.ethers.getContractFactory('Cream', {
      libraries: {
        Poseidon: poseidon.address,
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
      signer: contractOwner,
    })

    const cream = await Cream.deploy(
      creamVerifier.address,
      votingToken.address,
      config.cream.merkleTreeDepth,
      recipients,
      coordinator.address,
      config.maci.signUpDurationInSeconds,
      config.maci.votingDurationInSeconds
    )

    const SignUpTokenGatekeeper = await ethers.getContractFactory(
      'SignUpTokenGatekeeper'
    )
    const signUpToken = await ethers.getContract('SignUpToken')
    const signUpTokenGatekeeper = await SignUpTokenGatekeeper.deploy(
      signUpToken.address
    )

    const ConstantInitialVoiceCreditProxy = await ethers.getContractFactory(
      'ConstantInitialVoiceCreditProxy'
    )
    const constantInitialVoiceCreditProxy =
      await ConstantInitialVoiceCreditProxy.deploy(
        config.maci.initialVoiceCreditBalance
      )

    const deployMaciTx = await maciFactory.deployMaci(
      signUpTokenGatekeeper.address,
      constantInitialVoiceCreditProxy.address,
      coordinatorEdDSAKeypair.pubKey.asContractParam()
    )
    const maciAddr = await extractSingleEventArg1(deployMaciTx, 'MaciDeployed')
    const MACI = await ethers.getContractFactory('MACI', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
        PoseidonT5: poseidonT5.address,
        PoseidonT6: poseidonT6.address,
      },
    })
    const maci = await MACI.attach(maciAddr)

    await signUpToken.transferOwnership(cream.address)
    await cream.setMaci(maci.address, signUpToken.address)

    const CreamVerifier = await ethers.getContractFactory('CreamVerifier')

    return {
      signers: {
        contractOwner,
        coordinator,
        voter,
        voter2,
        badUser,
      },
      recipients,
      cream,
      Cream,
      maci,
      votingToken,
      creamVerifier,
      CreamVerifier,
      signUpToken,
    }
  })

  const testDir = `${__dirname}/../test-site`

  before(() => {
    prepare4VoteCircuitTests(testDir)
  })

  beforeEach(async () => {
    const { cream, votingToken, signers } = await setupTest()
    await votingToken.giveToken(signers.voter.address)
    await votingToken
      .connect(signers.voter)
      .setApprovalForAll(cream.address, true)
  })

  describe('initialize', () => {
    let cream: Contract
    let votingToken: Contract
    let CreamVerifier: ContractFactory
    let signers: { [name: string]: SignerWithAddress }
    let recipients: string[]

    before(async () => {
      const {
        votingToken: _votingToken,
        cream: _cream,
        creamVerifier: _creamVerifier,
        CreamVerifier: _CreamVerifier,
        signers: _signers,
        recipients: _recipients,
      } = await setupTest()

      votingToken = _votingToken
      cream = _cream
      CreamVerifier = _CreamVerifier
      signers = _signers
      recipients = _recipients
    })

    it('should return correct votingToken address', async () => {
      const tokenAddress = await cream.votingToken.call()
      expect(tokenAddress).to.equal(votingToken.address)
    })

    it('should return correct current token supply amount', async () => {
      const crrSupply = await votingToken.getCurrentSupply()
      expect(crrSupply).to.equal(2)
    })

    it('should return corret token owner address', async () => {
      const ownerOfToken1 = await votingToken.ownerOf(1)
      expect(ownerOfToken1).to.equal(signers.voter.address)
    })

    it('should return correct recipient address', async () => {
      for (let i = 0; i < recipients.length; ++i) {
        expect(await cream.recipients(i)).to.equal(recipients[i])
      }
    })

    it('should be able to update verifier contract by owner', async () => {
      const oldVerifier = await cream.verifier()
      const newVerifier = await CreamVerifier.deploy()

      await cream.updateVerifier(newVerifier.address)
      const currVerifier = await cream.verifier()

      expect(oldVerifier).to.not.equal(currVerifier)
    })

    it('should prevent update verifier contract by non-owner', async () => {
      const newVerifier = await CreamVerifier.deploy()
      await expect(
        cream.connect(signers.voter).updateVerifier(newVerifier.address)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('deposit', () => {
    let cream: Contract
    let Cream: ContractFactory
    let votingToken: Contract
    let creamVerifier: Contract
    let signers: { [name: string]: SignerWithAddress }
    let recipients: string[]

    before(async () => {
      const {
        votingToken: _votingToken,
        cream: _cream,
        Cream: _Cream,
        creamVerifier: _creamVerifier,
        signers: _signers,
        recipients: _recipients,
      } = await setupTest()

      votingToken = _votingToken
      cream = _cream
      Cream = _Cream
      creamVerifier = _creamVerifier
      signers = _signers
      recipients = _recipients
    })

    it('should Fail deposit before calling setMaci()', async () => {
      const newCream = await Cream.deploy(
        creamVerifier.address,
        votingToken.address,
        LEVELS,
        recipients,
        signers.coordinator.address,
        signUpDuration,
        votingDuration
      )
      const deposit = createDeposit(rbigInt(31), rbigInt(31))

      await expect(
        newCream.connect(signers.voter).deposit(toHex(deposit.commitment))
      ).to.be.revertedWith('MACI contract have not set yet')
    })

    it('should correctly emit event', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await expect(
        cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      ).to.emit(cream, 'Deposit')
    })

    it('should return correct index', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      const tx = await cream
        .connect(signers.voter)
        .deposit(toHex(deposit.commitment))
      const events = await extractEvents(tx)
      expect(events.length).to.equal(1)
      expect(events[0].name).to.equal('Deposit')
      expect(events[0].args.length).to.equal(3)
      expect(events[0].args[1]).to.equal(0)
    })

    it('should be able to find deposit event from commitment', async () => {
      const deposit1 = createDeposit(rbigInt(31), rbigInt(31))
      const tx1 = await cream
        .connect(signers.voter)
        .deposit(toHex(deposit1.commitment))

      // voter 2 deposit
      await votingToken.giveToken(signers.voter2.address)
      await votingToken
        .connect(signers.voter2)
        .setApprovalForAll(cream.address, true)
      const deposit2 = createDeposit(rbigInt(31), rbigInt(31))
      const tx2 = await cream
        .connect(signers.voter2)
        .deposit(toHex(deposit2.commitment))

      // TODO : load `gemerateMerkleProof` function from cream-lib
      const eventsTx1 = await extractEvents(tx1)
      const eventsTx2 = await extractEvents(tx2)
      const events = eventsTx1.concat(eventsTx2)

      const eventWithDeposit1Commitment = events.find(
        (x) => bigInt(x.args[0]) === deposit1.commitment
      )
      expect(eventWithDeposit1Commitment).to.be.not.undefined
      // leaf index should be 0
      expect(eventWithDeposit1Commitment!.args[1]).to.equal(0)

      const eventWithDeposit2Commitment = events.find(
        (x) => bigInt(x.args[0]) === deposit2.commitment
      )
      expect(eventWithDeposit2Commitment).to.be.not.undefined
      // leaf index should be 1
      expect(eventWithDeposit2Commitment!.args[1]).to.equal(1)
    })

    it('should throw an error for non-token holder', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await expect(
        cream.connect(signers.badUser).deposit(toHex(deposit.commitment))
      ).to.be.revertedWith('Sender does not own appropreate amount of token')
    })

    // voter and bad user collude pattern
    it('should throw an error for more than two tokens holder', async () => {
      const badUser = signers.badUser
      const voter = signers.voter
      await votingToken.giveToken(badUser.address)
      await votingToken.connect(badUser).setApprovalForAll(cream.address, true)
      await votingToken.connect(voter).setApprovalForAll(badUser.address, true)
      await votingToken
        .connect(voter)
        ['safeTransferFrom(address,address,uint256)'](
          voter.address,
          badUser.address,
          1
        )

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await expect(
        cream.connect(badUser).deposit(toHex(deposit.commitment))
      ).to.be.revertedWith('Sender does not own appropreate amount of token')

      const balance = await votingToken.balanceOf(badUser.address)
      expect(balance).to.equal(2)
    })

    it('should throw an error for same commitment submittion', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      await expect(
        cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      ).to.be.revertedWith('Already submitted')
    })

    // TODO: add isBeforeVotingDeadline test
  })

  describe('snark proof verification on js side', () => {
    it('should detect tampering', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const circuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: deposit.nullifierHash,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const proofPubSigs = await buildVoteCircuitProof(testDir, circuitInputs, 'tamper')

      const isValid1 = await verifyVoteCircuitProof(testDir, proofPubSigs, 'tamper')
      expect(isValid1).to.equal(true)

      // make public signals invalid
      proofPubSigs.publicSignals[0] =
        '133792158246920651341275668520530514036799294649489851421007411546007850802'
      const isValid2 = await verifyVoteCircuitProof(testDir, proofPubSigs, 'tamper')
      expect(isValid2).to.equal(false)
    })
  })

  describe('signUpMaci', () => {
    let cream: Contract
    let signUpToken: Contract
    let signers: { [name: string]: SignerWithAddress }

    before(async () => {
      const {
        cream: _cream,
        signers: _signers,
        signUpToken: _signUpToken,
      } = await setupTest()

      cream = _cream
      signUpToken = _signUpToken
      signers = _signers
    })

    const userKeypair = new Keypair()

    it('should correctly sign up to maci with SignUpToken', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const circuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, circuitInputs, 'signup')

      const userPubKey = userKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      const tx = await cream
        .connect(signers.voter)
        .signUpMaci(
          userPubKey,
          formattedProof,
          toHex(circuitInputs.root),
          toHex(circuitInputs.nullifierHash)
        )
      const receipt = await tx.wait()
      expect(receipt.status).to.equal(1) // 1 means true

      const tokenOwnerAddress = await signUpToken.ownerOf(1)
      expect(tokenOwnerAddress).to.equal(signers.voter.address)
    })

    it('should fail signUp with same proof', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInputs, 'failsignup')

      const userPubKey = userKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      await cream.signUpMaci(
        userPubKey,
        formattedProof,
        toHex(voteCircuitInputs.root),
        toHex(voteCircuitInputs.nullifierHash)
      )
      await expect(
        cream.signUpMaci(
          userPubKey,
          formattedProof,
          toHex(voteCircuitInputs.root),
          toHex(voteCircuitInputs.nullifierHash)
        )
      ).to.be.revertedWith('The nullifier Has Been Already Spent')
    })

    it('should prevent double spent with overflow', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInptus: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInptus, 'dblsp')

      const args = [
        toHex(voteCircuitInptus.root),
        toHex(
          toBN(stringifyBigInts(voteCircuitInptus.nullifierHash)).add(
            toBN(
              '21888242871839275222246405745257275088548364400416034343698204186575808495617'
            )
          )
        ),
      ]

      const userPubKey = userKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      await expect(
        cream.signUpMaci(userPubKey, formattedProof, ...args)
      ).to.be.revertedWith('verifier-gte-snark-scalar-field')
    })

    it('should throw for corrupted merkle tree root', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInptus: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInptus, 'crptmkr')

      const fakeRandomRoot = randomHex(32)
      const args = [
        toHex(fakeRandomRoot),
        toHex(voteCircuitInptus.nullifierHash),
      ]

      const userPubKey = userKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      await expect(
        cream.signUpMaci(userPubKey, formattedProof, ...args)
      ).to.be.revertedWith('Cannot find your merkle root')
    })

    it('should reject tampered public input on contract side', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInputs, 'tmppi')

      // Use commitment as nullifierHash
      const args = [toHex(voteCircuitInputs.root), toHex(deposit.commitment)]

      const userPubKey = userKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      await expect(
        cream.signUpMaci(userPubKey, formattedProof, ...args)
      ).to.be.revertedWith('Invalid deposit proof')
    })

    it('should reject after sign-up period is passed', async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInputs, 'aftsp')

      const args = [
        toHex(voteCircuitInputs.root),
        toHex(voteCircuitInputs.nullifierHash),
      ]

      const userPubKey = userKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      const duration = config.maci.signUpDurationInSeconds + 1
      const timestamp = (await getNextBlockTimestamp()) + duration
      await setNextBlockTimestamp(timestamp)

      await expect(
        cream.signUpMaci(userPubKey, formattedProof, ...args)
      ).to.be.revertedWith('the sign-up period has passed')
    })
  })

  describe('publishMessage', () => {
    let cream: Contract
    let maci: Contract
    let signers: { [name: string]: SignerWithAddress }

    before(async () => {
      const {
        cream: _cream,
        maci: _maci,
        signers: _signers,
      } = await setupTest()

      cream = _cream
      maci = _maci
      signers = _signers
    })

    let localMerkleTree
    let signUpTx
    let userEdDSAKeypair: any

    beforeEach(async () => {
      userEdDSAKeypair = new Keypair()
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      // Do signUpMaci process
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInputs, 'pubmsg')

      const userPubKey = userEdDSAKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)

      signUpTx = await cream.signUpMaci(
        userPubKey,
        formattedProof,
        toHex(voteCircuitInputs.root),
        toHex(voteCircuitInputs.nullifierHash)
      )
    })

    it('should correctly publishMessage', async () => {
      const userStateIndex = 1
      const recipientIndex = 0
      const nonce = 1
      const [message, encPubKey] = createMessage(
        userStateIndex,
        userEdDSAKeypair,
        null,
        coordinatorEdDSAKeypair.pubKey,
        recipientIndex,
        null,
        0,
        nonce
      )

      const pollAddress = await maci.getPoll(0)
      const poll = await ethers.getContractAt('Poll', pollAddress)
      const tx = await poll.publishMessage(
        message.asContractParam(),
        encPubKey.asContractParam()
      )
      await expectSingleEvent(tx, 'PublishMessage')
    })

    it('should correctly publish key change message', async () => {
      const newUserEdDSAKeyPair = new Keypair()
      const userStateIndex = 1
      const nonce = 1
      const [message, encPubKey] = createMessage(
        userStateIndex,
        userEdDSAKeypair,
        newUserEdDSAKeyPair,
        coordinatorEdDSAKeypair.pubKey,
        null,
        null,
        0,
        nonce
      )

      const pollAddress = await maci.getPoll(0)
      const poll = await ethers.getContractAt('Poll', pollAddress)
      const tx = await poll.publishMessage(
        message.asContractParam(),
        encPubKey.asContractParam()
      )
      await expectSingleEvent(tx, 'PublishMessage')
    })

    it('should be able to submit an invalid message', async () => {
      const newUserEdDSAKeyPair = new Keypair()
      const userStateIndex = 1
      const recipientIndex = 0
      const nonce = 1
      const [message1, encPubKey1] = createMessage(
        userStateIndex,
        userEdDSAKeypair,
        newUserEdDSAKeyPair,
        coordinatorEdDSAKeypair.pubKey,
        null,
        null,
        0,
        nonce
      )
      const pollAddress = await maci.getPoll(0)
      const poll = await ethers.getContractAt('Poll', pollAddress)

      const tx1 = await poll.publishMessage(
        message1.asContractParam(),
        encPubKey1.asContractParam()
      )

      const [message2, encPubKey2] = createMessage(
        userStateIndex,
        userEdDSAKeypair,
        null,
        coordinatorEdDSAKeypair.pubKey,
        recipientIndex,
        null,
        0,
        nonce + 1
      )
      const tx2 = await poll.publishMessage(
        message2.asContractParam(),
        encPubKey2.asContractParam()
      )

      await expectSingleEvent(tx1, 'PublishMessage')
      await expectSingleEvent(tx2, 'PublishMessage')
    })

    it('should be able to submit an invalid recipient index', async () => {
      const userStateIndex = 1
      const recipientIndex = 99
      const nonce = 1
      const [message, encPubKey] = createMessage(
        userStateIndex,
        userEdDSAKeypair,
        null,
        coordinatorEdDSAKeypair.pubKey,
        recipientIndex,
        null,
        0,
        nonce
      )

      const pollAddress = await maci.getPoll(0)
      const poll = await ethers.getContractAt('Poll', pollAddress)
      const tx = await poll.publishMessage(
        message.asContractParam(),
        encPubKey.asContractParam()
      )

      await expectSingleEvent(tx, 'PublishMessage')
    })

    it('should be able to submit message batch', async () => {
      let nonce
      const messages = []
      const encPubKeys = []
      const numMessages = 2
      const userStateIndex = 1

      for (
        let recipientIndex = 1;
        recipientIndex < numMessages + 1;
        recipientIndex++
      ) {
        nonce = recipientIndex
        const [message, encPubKey] = createMessage(
          userStateIndex,
          userEdDSAKeypair,
          null,
          coordinatorEdDSAKeypair.pubKey,
          recipientIndex,
          null,
          0,
          nonce
        )
        messages.push(message.asContractParam())
        encPubKeys.push(encPubKey.asContractParam())
      }

      await cream.submitMessageBatch(messages, encPubKeys)
    })
  })

  describe('publishTallyHash', () => {
    let cream: Contract
    let maci: Contract
    let signers: { [name: string]: SignerWithAddress }

    before(async () => {
      const {
        cream: _cream,
        maci: _maci,
        signers: _signers,
      } = await setupTest()

      cream = _cream
      maci = _maci
      signers = _signers
    })

    it('should correctly publish tally hash', async () => {
      const hash = 'hash'
      const tx = await cream.connect(signers.coordinator).publishTallyHash(hash)
      await expectSingleEvent(tx, 'TallyPublished')
    })

    it('should revert if non-coordinator try to publish tally hash', async () => {
      const hash = 'hash'
      await expect(cream.publishTallyHash(hash)).to.be.revertedWith(
        'Sender is not the coordinator'
      )
    })

    it('should revert with an empty string', async () => {
      await expect(
        cream.connect(signers.coordinator).publishTallyHash('')
      ).to.be.revertedWith('Tally hash cannot be empty string')
    })
  })

  describe('withdraw', () => {
    const coordinatorEdDSAKeypair = new Keypair(
      new PrivKey(BigInt(config.maci.coordinatorPrivKey))
    )
    let cream: Contract
    let maci: Contract
    let votingToken: Contract
    let signers: { [name: string]: SignerWithAddress }
    let recipients: string[]

    before(async () => {
      const {
        cream: _cream,
        maci: _maci,
        votingToken: _votingToken,
        signers: _signers,
        recipients: _recipients,
      } = await setupTest()

      cream = _cream
      maci = _maci
      votingToken = _votingToken
      signers = _signers
      recipients = _recipients
    })

    let localMerkleTree

    beforeEach(async () => {
      const localMerkleTree = buildMerkleTree4VoteCircuit()

      const userEdDSAKeypair = new Keypair()
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      localMerkleTree.insert(deposit.commitment)
      await cream.connect(signers.voter).deposit(toHex(deposit.commitment))
      const root = localMerkleTree.root
      const merkleProof = localMerkleTree.getPathUpdate(0)
      const voteCircuitInputs: VoteCircuitInputs = {
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
      }
      const { proof } = await buildVoteCircuitProof(testDir, voteCircuitInputs, 'withdraw')

      const args = [
        toHex(voteCircuitInputs.root),
        toHex(voteCircuitInputs.nullifierHash),
      ]

      const userPubKey = userEdDSAKeypair.pubKey.asContractParam()
      const formattedProof = buildMaciProof(proof)
      await cream.signUpMaci(userPubKey, formattedProof, ...args)

      const userStateIndex = 1
      const recipientIndex = 0
      const nonce = 1
      const [message, encPubKey] = createMessage(
        userStateIndex,
        userEdDSAKeypair,
        null, // newUserKeypair
        coordinatorEdDSAKeypair.pubKey,
        recipientIndex, // voteOptionIndex
        null, // voiceCredit
        0, // pollId
        nonce
      )

      const pollAddress = await maci.getPoll(0)
      const poll = await ethers.getContractAt('Poll', pollAddress)
      await poll.publishMessage(
        message.asContractParam(),
        encPubKey.asContractParam()
      )

      const hash = 'hash'
      await cream.connect(signers.coordinator).publishTallyHash(hash)
    })

    it('should revert if non-owner try to approve', async () => {
      await expect(
        cream.connect(signers.coordinator).approveTally()
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should tally be approved', async () => {
      const tx = await cream.approveTally()
      await expectSingleEvent(tx, 'TallyApproved')
      expect(await cream.approved()).to.true
    })

    it('should revert before approval', async () => {
      await expect(
        cream.connect(signers.coordinator).withdraw(1)
      ).to.be.revertedWith('Tally result is not approved yet')
    })

    it('should revert if non-coordinator try to withdraw', async () => {
      await cream.approveTally()
      await expect(cream.connect(signers.voter).withdraw(1)).to.be.revertedWith(
        'Sender is not the coordinator'
      )
    })

    it('should correctly work and emit event', async () => {
      await cream.approveTally()
      const tx = await cream.connect(signers.coordinator).withdraw(1)
      await expectSingleEvent(tx, 'Withdrawal')
    })

    it('should correctly transfer token to recipient', async () => {
      await cream.approveTally()
      await cream.connect(signers.coordinator).withdraw(0)
      const newTokenOwner = await votingToken.ownerOf(1)
      expect(recipients[0]).to.equal(newTokenOwner)
    })
  })
})
