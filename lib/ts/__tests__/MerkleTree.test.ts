import {
    MerkleTree,
    bigInt,
    hashOne,
    hashLeftRight,
    SnarkBigInt,

} from '../'

const DEPTH = 2
const ZERO_VALUE = 0

/*
 * calculate a merkle root given a list of leaves
 */

const calculateRoot = (
    unhashedLeaves: SnarkBigInt[],
): SnarkBigInt => {
    const totalLeaves = 2 ** DEPTH
    const numLeafHashers = totalLeaves / 2
    const numIntermediateHashrs = numLeafHashers - 1

    const hashes: SnarkBigInt[] = []

    for (let i = 0; i < numLeafHashers; i++) {
        hashes.push(
            hashLeftRight(
                hashOne(unhashedLeaves[i * 2]),
                hashOne(unhashedLeaves[i * 2 + 1])
            )
        )
    }

    let k = 0
    for (let i = numLeafHashers; i < numLeafHashers + numIntermediateHashrs; i++) {
        hashes.push(
            hashLeftRight(hashes[k * 2], hashes[k * 2 + 1])
        )
        k++
    }
    return hashes[hashes.length - 1]
}

describe('MerkleTree', () => {
    const tree = new MerkleTree(DEPTH, ZERO_VALUE)

    it('should initialize correctly', () => {
        const INITIAL_ROOT = bigInt("8234632431858659206959486870703726442454087730228411315786216865106603625166")

        expect(tree.depth.toString()).toEqual(DEPTH.toString())
        expect(tree.zeroValue.toString()).toEqual(ZERO_VALUE.toString())
        expect(INITIAL_ROOT.toString()).toEqual(tree.root.toString())
    })

    it('should return correct root hash', () => {
        const leaves: SnarkBigInt[] = []

        for (let i = 0; i < 2 ** DEPTH; i++) {
            const leaf = bigInt(i + 1)
            leaves.push(leaf)
            tree.insert(hashOne(leaf))
        }

        expect(calculateRoot(leaves).toString()).toEqual(tree.root.toString())
    })

    it('should update correctly', () => {
        const tree1 = new MerkleTree(DEPTH, ZERO_VALUE)
        const tree2 = new MerkleTree(DEPTH, ZERO_VALUE)
        for (let i = 0; i < 2 ** DEPTH; i++) {
            tree1.insert(hashOne(i + 1))
            tree2.insert(hashOne(i + 1))
        }

        expect(tree1.root).toEqual(tree2.root)

        const indexToUpdate = 1
        const newVal = hashOne(bigInt(4))
        tree1.update(indexToUpdate, newVal)

        expect(tree1.root).not.toEqual(tree2.root)

        const tree3 = new MerkleTree(DEPTH, ZERO_VALUE)
        for (let leaf of tree1.leaves) {
            tree3.insert(leaf)
        }

        expect(tree1.root).toEqual(tree3.root)
        expect(tree3.getLeaf(indexToUpdate).toString()).toEqual(newVal.toString())
    })

})
