const {config} = require('cream-config')

const MerkleTreeContract = artifacts.require('MerkleTreeWithHistoryMock.sol')
const hasherContract = artifacts.require('MiMC.sol')

const { toHex } = require('libcream')

const { MerkleTree } = require('cream-merkle-tree')

const {
  revertSnapshot,
  takeSnapshot
} = require('./TestUtil')

contract('MerkleTreeWithHistory', accounts => {
  let tree
  let LEVELS = config.cream.merkleTrees.toString()
  const ZERO_VALUE = config.cream.zeroValue
  let hasherInstance
  let instance
  let snapshotId

  before(async () => {
    tree = new MerkleTree(
      LEVELS,
      ZERO_VALUE
    )
    hasherInstance = await hasherContract.deployed()
    await MerkleTreeContract.link(hasherContract, hasherInstance.address)
    instance = await MerkleTreeContract.new(LEVELS)
    snapshotId = await takeSnapshot()
  })

  describe('constructor', () => {
    it('should correctly initialze', async () => {
      const zeroValue = await instance.ZERO_VALUE()
      const firstSubtree = await instance.filledSubtrees(0)
      const firstZero = await instance.zeros(0)
      const rootFromContract = await instance.getLastRoot()

      assert.equal(firstSubtree, toHex(zeroValue))
      assert.equal(firstZero, toHex(zeroValue))
      assert.equal(toHex(tree.root), rootFromContract.toString())
    })
  })

  describe('insert', () => {
    it('should correctly insert', async () => {
      let rootFromContract

      for(let i = 1; i < LEVELS; i++) {
        await instance.insert(toHex(i), {from: accounts[0]})
        tree.insert(i)
        const root = tree.root
        rootFromContract = await instance.getLastRoot()

        assert.equal(toHex(root), rootFromContract.toString())
      }
    })

    it('should reject if tree is full', async () => {
      LEVELS = 6

      const instance = await MerkleTreeContract.new(LEVELS)

      for (let i = 0; i < 2 ** LEVELS; i++) {
        await instance.insert(toHex(i+42))
      }

      try {
        await instance.insert(toHex(1))
      } catch(error) {
        assert.equal(error.reason, 'Merkle tree is full')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  afterEach(async () => {
    await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    snapshotId = await takeSnapshot()
    tree = new MerkleTree(
      LEVELS,
      ZERO_VALUE
    )
  })
})
