jest.setTimeout(90000)
import { mimcsponge } from 'circomlib'
import MerkleTree from 'cream-merkle-tree'
import { bigInt, toHex } from 'libcream'
import { SnarkBigInt, compileAndLoadCircuit, executeCircuit } from '../'

const LEVELS = 4
const ZERO_VALUE = 0

const hashOne = (
    preImage: SnarkBigInt
): SnarkBigInt => {
    return mimcsponge.multiHash([preImage], 0, 1)
}

const multiHash = (
    d: SnarkBigInt[]
): SnarkBigInt => {
    return mimcsponge.multiHash(d)
}

describe('MerkleTree circuit', () => {
    describe('HashLeftRight', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTreeHashLeftRight_test.circom')
        })

        it('should hash correctly', async () => {
            const input = {
                left: "12345",
                right: "45678"
            }

            const witness = await executeCircuit(circuit, input)
            const output = witness[circuit.symbols["main.hash"].varIdx]
            const outputJS = multiHash([bigInt(12345), bigInt(45678)])

            expect(output.toString()).toEqual(outputJS.toString())
        })
    })

    describe('LeafExists', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTreeLeafExists_test.circom')
        })

        it('should work with valid input for LeafExists', async () => {
            const tree = new MerkleTree(LEVELS, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const proof = tree.getPathUpdate(i)
                const input = {
                    leaf: leaves[i],
                    path_elements: proof[0],
                    path_index: proof[1],
                    root,
                }

                const witness = await executeCircuit(circuit, input)
                const circuitRoot = witness[circuit.symbols["main.root"].varIdx]
                expect(circuitRoot.toString()).toEqual(root.toString())
            }
        })

        it('should return error with invalid LeafExists input', async () => {
            const tree = new MerkleTree(LEVELS, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const proof = tree.getPathUpdate(i)

                const input = {
                    leaf: leaves[i],
                    // swapping input elements
                    path_elements: proof[1],
                    path_index: proof[0],
                    root
                }

                try {
                    await executeCircuit(circuit, input)
                } catch {
                    expect(true).toBeTruthy()
                }
            }
        })
    })

    describe('CheckRoot', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTreeCheckRoot_test.circom')
        })

        it('should return valid root', async () => {
            const tree = new MerkleTree(LEVELS, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            const input = { leaves }

            const witness = await executeCircuit(circuit, input)
            expect(witness[circuit.symbols["main.root"].varIdx].toString()).toEqual(root.toString())
        })

        it('should generate different root from different leaves', async () => {
            const tree = new MerkleTree(LEVELS, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)

                // Give the circuit a different leaf
                leaves.push(toHex(randVal + 1, 32))
            }

            const root = tree.root
            const input = { leaves }
            const witness = await executeCircuit(circuit, input)
            expect(witness[circuit.symbols["main.root"].varIdx].toString()).not.toEqual(root.toString())
        })
    })

    describe('MerkleTree', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('test/merkleTree_test.circom')
        })

        it('should work with valid input', async () => {
            const tree = new MerkleTree(LEVELS, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const proof = tree.getPathUpdate(i)
                const input = {
                    leaf: leaves[i],
                    path_elements: proof[0],
                    path_index: proof[1]
                }

                const witness = await executeCircuit(circuit, input)
                expect(witness[circuit.symbols["main.root"].varIdx].toString()).toEqual(root.toString())
            }
        })

        it('should return error with invalid proof', async () => {
            const tree = new MerkleTree(LEVELS, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const proof = tree.getPathUpdate(i)
                const input = {
                    leaf: leaves[i],
                    // swapped proof
                    path_elements: proof[1],
                    path_index: proof[0]
                }

                try {
                    await executeCircuit(circuit, input)
                } catch {
                    expect(true).toBeTruthy()
                }
            }
        })
    })
})

