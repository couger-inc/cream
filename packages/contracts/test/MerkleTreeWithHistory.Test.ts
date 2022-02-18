import 'hardhat-deploy' // for ambient module declarations
import { config } from '@cream/config'
import { expect } from 'chai'
import hre from 'hardhat'
import { getUnnamedAccounts } from './TestUtil'

const { MerkleTree } = require('cream-merkle-tree')
const { toHex } = require('libcream')

const ethers = hre.ethers
const deployments = hre.deployments

describe('MerkleTreeWithHistory', () => {
  const LEVELS = 4 // using 4 since config.cream.merkleTreeDepth (10) takes too much time for testing
  const ZERO_VALUE = config.cream.zeroValue
  const merkleTreeClass = new MerkleTree(LEVELS, ZERO_VALUE)

  const setupTest = deployments.createFixture(async () => {
    await deployments.fixture()

    const poseidon = await ethers.getContract('Poseidon')
    const MerkleTreeWithHistory4Test = await ethers.getContractFactory(
      'MerkleTreeWithHistoryMock',
      {
        libraries: {
          Poseidon: poseidon.address,
        },
      }
    )
    const merkleTreeContract = await MerkleTreeWithHistory4Test.deploy(LEVELS)
    const [deployer] = await getUnnamedAccounts(hre)

    return {
      deployer,
      merkleTreeContract,
      MerkleTreeWithHistory4Test,
    }
  })

  describe('initialze', () => {
    it('should correctly initialze', async () => {
      const { merkleTreeContract } = await setupTest()
      const zeroValue = await merkleTreeContract.ZERO_VALUE()
      const firstSubtree = await merkleTreeContract.filledSubtrees(0)
      const firstZero = await merkleTreeContract.zeros(0)
      const rootFromContract = await merkleTreeContract.getLastRoot()

      expect(firstSubtree).to.equal(toHex(zeroValue))
      expect(firstZero, toHex(zeroValue))
      expect(toHex(merkleTreeClass.root)).to.equal(rootFromContract.toString())
    })
  })

  describe('insert', () => {
    it('should correctly insert', async () => {
      const { merkleTreeContract, deployer } = await setupTest()

      for (let i = 1; i < LEVELS; i++) {
        await merkleTreeContract.connect(deployer).insert(toHex(i))
        merkleTreeClass.insert(i)
        const root = merkleTreeClass.root
        const rootFromContract = await merkleTreeContract.getLastRoot()

        expect(toHex(root)).to.equal(rootFromContract.toString())
      }
    })

    it('should reject if tree is full', async () => {
      const { MerkleTreeWithHistory4Test } = await setupTest()
      const merkleTreeContract = await MerkleTreeWithHistory4Test.deploy(LEVELS)

      for (let i = 0; i < 2 ** LEVELS; i++) {
        await merkleTreeContract.insert(toHex(i + 42))
      }

      await expect(merkleTreeContract.insert(toHex(1))).to.be.revertedWith(
        'Merkle tree is full'
      )
    })
  })
})
