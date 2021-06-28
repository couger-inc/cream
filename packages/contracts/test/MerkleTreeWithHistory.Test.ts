const { config } = require('@cream/config')
const { toHex } = require('libcream')
const { MerkleTree } = require('cream-merkle-tree')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')

const MerkleTreeContract = artifacts.require('MerkleTreeWithHistoryMock')
const MiMC = artifacts.require('MiMC')

contract('MerkleTreeWithHistory', (accounts) => {
    let tree
    let mimc
    let merkleTree
    let snapshotId
    let LEVELS = config.cream.merkleTrees
    const ZERO_VALUE = config.cream.zeroValue

    before(async () => {
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
        mimc = await MiMC.deployed()
        await MerkleTreeContract.link(MiMC, mimc.address)
        merkleTree = await MerkleTreeContract.new(LEVELS)
        snapshotId = await takeSnapshot()
    })

    describe('initialze', () => {
        it('should correctly initialze', async () => {
            const zeroValue = await merkleTree.ZERO_VALUE()
            const firstSubtree = await merkleTree.filledSubtrees(0)
            const firstZero = await merkleTree.zeros(0)
            const rootFromContract = await merkleTree.getLastRoot()

            assert.equal(firstSubtree, toHex(zeroValue))
            assert.equal(firstZero, toHex(zeroValue))
            assert.equal(toHex(tree.root), rootFromContract.toString())
        })
    })

    describe('insert', () => {
        it('should correctly insert', async () => {
            let rootFromContract

            for (let i = 1; i < LEVELS; i++) {
                await merkleTree.insert(toHex(i), { from: accounts[0] })
                tree.insert(i)
                const root = tree.root
                rootFromContract = await merkleTree.getLastRoot()

                assert.equal(toHex(root), rootFromContract.toString())
            }
        })

        it('should reject if tree is full', async () => {
            LEVELS = 6
            merkleTree = await MerkleTreeContract.new(LEVELS)

            for (let i = 0; i < 2 ** LEVELS; i++) {
                await merkleTree.insert(toHex(i + 42))
            }

            try {
                await merkleTree.insert(toHex(1))
            } catch (error) {
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
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
    })
})
