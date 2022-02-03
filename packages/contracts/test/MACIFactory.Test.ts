import 'hardhat-deploy' // need this for ambient module declarations
import { config } from '@cream/config'
import hre from 'hardhat'
import { expect } from 'chai'
import { Keypair, PrivKey } from 'maci-domainobjs'
import { getUnnamedAccounts, extractEventsOfName } from './TestUtil'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'

describe('MACIFactory', () => {
  const coordinatorEdDSAKeyPair = new Keypair(
    new PrivKey(BigInt(config.maci.coordinatorPrivKey))
  )
  const ethers = hre.ethers
  const deployments = hre.deployments

  const setupTest = deployments.createFixture(async () => {
    await deployments.fixture()

    const poseidonT3 = await ethers.getContract('PoseidonT3')
    const poseidonT4 = await ethers.getContract('PoseidonT4')
    const poseidonT5 = await ethers.getContract('PoseidonT5')
    const poseidonT6 = await ethers.getContract('PoseidonT6')
    const maciFactory = await ethers.getContract('MACIFactory')

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

    const [contractOwner, coordinator, voter] = await getUnnamedAccounts(hre)

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
        coordinator,
        voter,
      },
      Maci,
      maciFactory,
      constantInitialVoiceCreditProxy,
      signUpTokenGatekeeper,
    }
  })

  let constantInitialVoiceCreditProxy: Contract
  let signUpTokenGatekeeper: Contract
  let maciFactory: Contract
  let signers: { [name: string]: SignerWithAddress }
  let Maci: ContractFactory

  before(async () => {
    const {
      constantInitialVoiceCreditProxy: _constantInitialVoiceCreditProxy,
      signUpTokenGatekeeper: _signUpTokenGatekeeper,
      maciFactory: _maciFactory,
      signers: _signers,
      Maci: _Maci,
    } = await setupTest()

    constantInitialVoiceCreditProxy = _constantInitialVoiceCreditProxy
    signUpTokenGatekeeper = _signUpTokenGatekeeper
    maciFactory = _maciFactory
    signers = _signers
    Maci = _Maci
  })

  describe('initialize', () => {
    it('should correctly initialized', async () => {
      const { maciFactory } = await setupTest()
      const votingDuration = await maciFactory.votingDuration()
      const expectedDuration = config.maci.votingDurationInSeconds
      expect(expectedDuration).to.equal(votingDuration)
    })

    it('should be able to deploy MACI', async () => {
      const tx = await maciFactory.deployMaci(
        signUpTokenGatekeeper.address,
        constantInitialVoiceCreditProxy.address,
        coordinatorEdDSAKeyPair.pubKey.asContractParam()
      )
      const events = await extractEventsOfName(tx, 'MaciDeployed')
      expect(events.length).to.equal(1)
    })

    it('should revert if non owner try to deploy MACI', async () => {
      const f = maciFactory
        .connect(signers.voter)
        .deployMaci(
          signUpTokenGatekeeper.address,
          constantInitialVoiceCreditProxy.address,
          coordinatorEdDSAKeyPair.pubKey.asContractParam()
        )
      await expect(f).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should be able to set MACI parameters', async () => {
      const tx = await maciFactory.deployMaci(
        signUpTokenGatekeeper.address,
        constantInitialVoiceCreditProxy.address,
        coordinatorEdDSAKeyPair.pubKey.asContractParam()
      )
      const events = await extractEventsOfName(tx, 'MaciDeployed')
      expect(events.length).to.equal(1)

      const _intStateTreeDepth = 3
      const _messageTreeDepth = 3
      const _messageTreeSubDepth = 3
      const _voteOptionTreeDepth = 3
      const _signUpDuration = 86400
      const _votingDuration = 86400

      const tx2 = await maciFactory.setMaciParameters(
        _intStateTreeDepth,
        _messageTreeSubDepth,
        _messageTreeDepth,
        _voteOptionTreeDepth,
        _signUpDuration,
        _votingDuration
      )
      const events2 = await extractEventsOfName(tx2, 'MaciParametersChanged')
      expect(events2.length).to.equal(1)
    })

    it('should fail if non owner try to set MACI pamameter', async () => {
      const tx = await maciFactory.deployMaci(
        signUpTokenGatekeeper.address,
        constantInitialVoiceCreditProxy.address,
        coordinatorEdDSAKeyPair.pubKey.asContractParam()
      )
      const events = await extractEventsOfName(tx, 'MaciDeployed')
      expect(events.length).to.equal(1)
      const maciAddress = events[0].args[0]
      const maci = await Maci.attach(maciAddress)

      const _intStateTreeDepth = 3
      const _messageTreeDepth = 3
      const _messageTreeSubDepth = 3
      const _voteOptionTreeDepth = 3
      const _signUpDuration = 86400
      const _votingDuration = 86400

      const f = maciFactory
        .connect(signers.voter)
        .setMaciParameters(
          _intStateTreeDepth,
          _messageTreeSubDepth,
          _messageTreeDepth,
          _voteOptionTreeDepth,
          _signUpDuration,
          _votingDuration
        )
      await expect(f).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })
})
