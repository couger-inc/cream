import 'hardhat-deploy' // need this for ambient module declarations
import hre from 'hardhat'
import { expect } from 'chai'
import {
  getUnnamedAccounts,
  extractEventsOfName,
  extractSingleEventArg1,
  coordinatorEdDSAKeypair,
  IPFS_HASH,
  LEVELS,
  BALANCE,
} from './TestUtil'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'

const ethers = hre.ethers
const deployments = hre.deployments

describe('CreamFactory', () => {
  const setupTest = deployments.createFixture(async () => {
    await deployments.fixture()

    const creamFactory = await ethers.getContract('CreamFactory')
    const poseidon = await ethers.getContract('Poseidon')
    const poseidonT3 = await ethers.getContract('PoseidonT3')
    const poseidonT4 = await ethers.getContract('PoseidonT4')
    const poseidonT5 = await ethers.getContract('PoseidonT5')
    const poseidonT6 = await ethers.getContract('PoseidonT6')
    const creamVerifier = await ethers.getContract('CreamVerifier')
    const votingToken = await ethers.getContract('VotingToken')
    const signUpToken = await ethers.getContract('SignUpToken')
    const maciFactory = await ethers.getContract('MACIFactory')

    const [
      contractOwner,
      coordinator,
      voter,
      recipient1,
      recipient2,
      recipient3,
      recipient4,
      recipient5,
    ] = await getUnnamedAccounts(hre)
    const recipients = [
      recipient1.address,
      recipient2.address,
      recipient3.address,
    ]
    const recipients2 = [recipient4.address, recipient5.address]

    const Cream = await hre.ethers.getContractFactory('Cream', {
      libraries: {
        Poseidon: poseidon.address,
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
    const SignUpToken = await ethers.getContractFactory('SignUpToken')

    return {
      signers: {
        contractOwner,
        coordinator,
        voter,
      },
      recipients,
      recipients2,
      creamFactory,
      Poll,
      Cream,
      Maci,
      votingToken,
      creamVerifier,
      signUpToken,
      SignUpToken,
      maciFactory,
      poseidon,
      poseidonT3,
      poseidonT4,
      poseidonT5,
      poseidonT6,
    }
  })

  let creamFactory: Contract
  let creamVerifier: Contract
  let votingToken: Contract
  let signUpToken: Contract
  let maciFactory: Contract
  let signers: { [name: string]: SignerWithAddress }
  let recipients: string[]
  let recipients2: string[]
  let cream: Contract
  let maci: Contract
  let Poll: ContractFactory
  let Cream: ContractFactory
  let able2CreateCream = false

  before(async () => {
    const createCreamMaci = async (
      _coordinatorAddr: string,
      _Cream: ContractFactory,
      _creamFactory: Contract,
      _creamVerifierAddr: string,
      _Maci: ContractFactory,
      _recipients: string[],
      _SignUpToken: ContractFactory,
      _signUpTokenAddr: string,
      _votingTokenAddr: string
    ) => {

      const tx = await _creamFactory.createCream(
        _creamVerifierAddr,
        _votingTokenAddr,
        _signUpTokenAddr,
        BALANCE,
        LEVELS,
        _recipients,
        IPFS_HASH,
        coordinatorEdDSAKeypair.pubKey.asContractParam(),
        _coordinatorAddr
      )
      const creamAddress = await extractSingleEventArg1(tx, 'CreamCreated')
      able2CreateCream = true
      const cream = await _Cream.attach(creamAddress)
      const maciAddress = await cream.maci()
      const maci = await _Maci.attach(maciAddress)

      // const signUpToken = await _SignUpToken.attach(_signUpTokenAddr)
      // await signUpToken.transferOwnership(cream.address)
      // await cream.setMaci(maci.address, signUpToken.address)

      return { cream, maci }
    }

    const {
      creamFactory: _creamFactory,
      creamVerifier: _creamVerifier,
      votingToken: _votingToken,
      signUpToken: _signUpToken,
      SignUpToken: _SignUpToken,
      maciFactory: _maciFactory,
      signers: _signers,
      recipients: _recipients,
      recipients2: _recipients2,
      Poll: _Poll,
      Cream: _Cream,
      Maci,
    } = await setupTest()

    creamFactory = _creamFactory
    creamVerifier = _creamVerifier
    votingToken = _votingToken
    signUpToken = _signUpToken
    maciFactory = _maciFactory
    votingToken = _votingToken
    signers = _signers
    Poll = _Poll
    Cream = _Cream
    recipients = _recipients
    recipients2 = _recipients2

    await maciFactory.transferOwnership(creamFactory.address)

    const { cream: _cream, maci: _maci } = await createCreamMaci(
      signers.coordinator.address,
      Cream,
      creamFactory,
      creamVerifier.address,
      Maci,
      recipients,
      _SignUpToken,
      signUpToken.address,
      votingToken.address
    )
    cream = _cream
    maci = _maci
  })

  describe('initialize', () => {
    it('should correctly initialize ownership', async () => {
      expect(await creamFactory.owner()).to.equal(signers.contractOwner.address)
    })

    ///////////// DO NOT INCLUDE
    // removed onlyOwner at the moment since anyone should be able to deploy new cream contract
    //
    // it('should fail when non owner tried to create Cream contract', async () => {
    //     try {
    //         await creamFactory.createCream(
    //             votingToken.address,
    //             signUpToken.address,
    //             BALANCE,
    //             LEVELS,
    //             RECIPIENTS,
    //             IPFS_HASH,
    //             coordinator.pubKey.asContractParam(),
    //             coordinatorAddress,
    //             { from: voter }
    //         )
    //     } catch (error) {
    //         assert.equal(error.reason, 'Ownable: caller is not the owner')
    //         return
    //     }
    //     assert.fail('Expected revert not received')
    // })
    ///////////// DO NOT INCLUDE

    it('should be able to set MACI parameters from CreamFactory', async () => {
      // due to a bug in 1.0.2, tree depth needs to be <= 3
      const _intStateTreeDepth = 3
      const _messageTreeSubDepth = 2
      const _messageTreeDepth = 3
      const _voteOptionTreeDepth = 3
      const _signUpDuration = 86400
      const _votingDuration = 86400

      await creamFactory.setMaciParameters(
        _intStateTreeDepth,
        _messageTreeSubDepth,
        _messageTreeDepth,
        _voteOptionTreeDepth,
        _signUpDuration,
        _votingDuration
      )
    })

    it('should correctly set maci contract from CreamFactory', async () => {
      const pollAddress = await maci.getPoll(0)
      const poll = Poll.attach(pollAddress)
      const creamCoordinatorPubKey = await poll.coordinatorPubKey()
      expect(creamCoordinatorPubKey.x).to.equal(
        coordinatorEdDSAKeypair.pubKey.asContractParam().x
      )
      expect(creamCoordinatorPubKey.y).to.equal(
        coordinatorEdDSAKeypair.pubKey.asContractParam().y
      )
    })

  })

  describe('contract deploy', () => {
    it('should be able to deploy cream contract', async () => {
      expect(able2CreateCream).to.be.true
    })

    it('should be able to receive correct value from mapped contract address', async () => {
      expect(await creamFactory.electionDetails(cream.address)).to.equal(
        IPFS_HASH
      )
    })

    it('should be able to receive correct value from cream contract side', async () => {
      expect(await cream.verifier()).to.equal(creamVerifier.address)
      expect(await cream.votingToken()).to.equal(votingToken.address)
      expect(await cream.recipients(0)).to.equal(recipients[0])
      expect(await cream.coordinator()).to.equal(signers.coordinator.address)
    })

    it('should be able to deploy another cream contract', async () => {
      await votingToken.giveToken(signers.voter.address)
      await votingToken
        .connect(signers.voter)
        .setApprovalForAll(cream.address, true)

      const VotingToken = await ethers.getContractFactory('VotingToken')
      votingToken = await VotingToken.deploy()

      const CreamVerifier = await ethers.getContractFactory('CreamVerifier')
      const newVerifier = await CreamVerifier.deploy()

      const NEW_RECIPIENTS = recipients2
      const tx = await creamFactory.createCream(
        newVerifier.address,
        votingToken.address,
        signUpToken.address,
        BALANCE,
        LEVELS,
        NEW_RECIPIENTS,
        IPFS_HASH,
        coordinatorEdDSAKeypair.pubKey.asContractParam(),
        signers.coordinator.address
      )
      const events = await extractEventsOfName(tx, 'CreamCreated')
      expect(events.length).to.equal(1)
      const newCreamAddress = events[0].args[0]
      const newCream = await Cream.attach(newCreamAddress)
      expect(await creamFactory.electionDetails(cream.address)).to.equal(
        IPFS_HASH
      )
      expect(await creamFactory.electionDetails(newCreamAddress)).to.equal(
        IPFS_HASH
      )
    })
  })
})
