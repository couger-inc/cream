const { revertSnapshot, takeSnapshot, toFixedHex } = require('./TestUtil')
const MerkleTree = require('../lib/MerkleTree')
const hasherImpl = require('../lib/MiMC')

const MerkleTreeContract = artifacts.require('MerkleTreeWithHistoryMock.sol')
const hasherContract = artifacts.require('Hasher.sol')

contract('MerkleTreeWithHistory', accounts => {
  let tree
  let levels = 16
  let prefix = 'test'
  let hasherInstance
  let instance
  let snapshotId

  before(async () => {
    tree = new MerkleTree(
      levels,
      null,
      prefix,
    )
    hasherInstance = await hasherContract.deployed()
    await MerkleTreeContract.link(hasherContract, hasherInstance.address)
    instance = await MerkleTreeContract.new(levels)
    snapshotId = await takeSnapshot()
  })

  describe('constructor', () => {
    it('should initialze', async () => {
      const zeroValue = await instance.ZERO_VALUE()
      const firstSubtree = await instance.filledSubtrees(0)
      assert.equal(firstSubtree, toFixedHex(zeroValue))
      const firstZero = await instance.zeros(0)
      assert.equal(firstZero, toFixedHex(zeroValue))
    })
  })

  describe('merkleTreeLib', () => {
    it('should correctly return index to key', async () => {
      assert.equal(MerkleTree.index_to_key('test', 5, 20), 'test_tree_5_20')
    })

    it('should insert test', async () => {
      hasher = new hasherImpl()
      tree = new MerkleTree(
        2,
        null,
        prefix,
      )
      await tree.insert(toFixedHex('5'))
      let { root, path_elements } = await tree.path(0)
      const calculated_root = hasher.hash(null,
        hasher.hash(null, '5', path_elements[0]),
        path_elements[1]
      )
      assert.equal(root, calculated_root)
    })

    it('should find an element', async () => {
      const elements = [12, 13, 14, 15, 16, 17, 18, 19, 20]
      for(const [, el] of Object.entries(elements)) {
        await tree.insert(el)
      }
      let index = tree.getIndexByElement(13)
      assert.equal(index, 1)

      index = tree.getIndexByElement(19)
      assert.equal(index, 7)

      index = tree.getIndexByElement(12)
      assert.equal(index, 0)

      index = tree.getIndexByElement(20)
      assert.equal(index, 8)

      index = tree.getIndexByElement(42)
      assert.equal(index, false)
    })
  })

  describe('insert', () => {
    it('should insert', async () => {
      let rootFromContract
      for(let i = 1; i < 11; i++) {
        await instance.insert(toFixedHex(i), {from: accounts[0]})
        await tree.insert(i)
        let { root } = await tree.path(i - 1)
        rootFromContract = await instance.getLastRoot()
        assert.equal(toFixedHex(root), rootFromContract.toString())
      }
    })
    it('should reject if tree is full', async () => {
      const levels = 6
      const instance = await MerkleTreeContract.new(levels)
      for (let i = 0; i < 2 **levels; i++) {
        await instance.insert(toFixedHex(i+42))
      }
      try {
        await instance.insert(toFixedHex(1337))
      } catch(error) {
        assert.equal(error.message, 'Returned error: VM Exception while processing transaction: revert Merkle tree is full -- Reason given: Merkle tree is full.')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  afterEach(async () => {
    await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    snapshotId = await takeSnapshot()
    hasher = new hasherImpl()
    tree = new MerkleTree(
      levels,
      null,
      prefix,
      null,
      hasher,
    )
  })
})