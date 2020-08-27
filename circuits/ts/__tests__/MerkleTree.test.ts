import { mimcsponge } from 'circomlib'
import MerkleTree from 'cream-merkle-tree'
import { bigInt } from 'libcream'
import { SnarkBigInt, compileAndLoadCircuit } from '../'

const DEPTH = 4
const ZERO_VALUE = 0

const toFixedHex = (number, length = 32) => {
    return (
        '0x' +
        bigInt(number)
            .toString(16)
            .padStart(length * 2, '0')
    )
}

const hashOne = (
    preImage: SnarkBigInt
): SnarkBigInt => {
    return mimcsponge.multiHash([preImage], 0, 1)
}

describe('MerkleTree circuit', () => {
    describe('Selector', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('merkleTreeSelector_test.circom')
        })

        it('should select correct path', async () => {
            const leaf = Math.floor(Math.random() * 1000)
            const path_element = Math.floor(Math.random() * 1000)

            const path_indexes = [0, 1]

            path_indexes.forEach(path_index => {
                const circuitInputs = {
                    input_element: leaf,
                    path_element: path_element,
                    path_index
                }

                const witness = circuit.calculateWitness(circuitInputs)

                const leftIdx = circuit.getSignalIdx("main.left")
                const left = witness[leftIdx]

                const rightIdx = circuit.getSignalIdx("main.right")
                const right = witness[rightIdx]

                if (path_index === 0) {
                    expect(left.toString()).toEqual(leaf.toString())
                    expect(right.toString()).toEqual(path_element.toString())
                } else {
                    expect(left.toString()).toEqual(path_element.toString())
                    expect(right.toString()).toEqual(leaf.toString())
                }
            })
        })
    })

    describe('LeafExists', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('merkleTreeLeafExists_test.circom')
        })

        it('should work with valid input for LeafExists', async () => {
            const tree = new MerkleTree(DEPTH, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const proof = tree.getPathUpdate(i)
                const circuitInputs = {
                    leaf: leaves[i],
                    path_elements: proof[0],
                    path_index: proof[1],
                    root,
                }

                const witness = circuit.calculateWitness(circuitInputs)
                expect(circuit.checkWitness(witness)).toBeTruthy()
            }
        })

        it('should return error with invalid LeafExists input', async () => {
            const tree = new MerkleTree(DEPTH, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const proof = tree.getPathUpdate(i)

                const circuitInputs = {
                    leaf: leaves[i],
                    //    swapping input elements
                    path_elements: proof[1],
                    path_index: proof[0],
                    root
                }

                expect(() => {
                    circuit.calculateWitness(circuitInputs)
                }).toThrow()
            }
        })
    })

    describe('CheckRoot', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('merkleTreeCheckRoot_test.circom')
        })

        it('should return valid root', async () => {
            const tree = new MerkleTree(DEPTH, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            const circuitInputs = { leaves }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(witness[circuit.getSignalIdx('main.root')].toString()).toEqual(root.toString())
            expect(circuit.checkWitness(witness)).toBeTruthy()

            // TODO: generate proof and verify
            //            const publicSignals = witness.slice(
            //                1,
            //                circuit.nPubInputs + circuit.nOutputs + 1
            //            )
        })

        it('should generate different root from different leaves', async () => {
            const tree = new MerkleTree(DEPTH, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)

                // Give the circuit a different leaf
                leaves.push(toFixedHex(randVal + 1))
            }

            const root = tree.root
            const circuitInputs = { leaves }
            const witness = circuit.calculateWitness(circuitInputs)
            expect(witness[circuit.getSignalIdx('main.root')].toString()).not.toEqual(root.toString())
            expect(circuit.checkWitness(witness)).toBeTruthy()
        })
    })

    describe('MerkleTree', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('merkleTree_test.circom')
        })

        it('should work with valid input', async () => {
            const tree = new MerkleTree(DEPTH, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const proof = tree.getPathUpdate(i)
                const circuitInputs = {
                    leaf: leaves[i],
                    path_elements: proof[0],
                    path_index: proof[1],
                    root
                }

                const witness = circuit.calculateWitness(circuitInputs)
                expect(witness[circuit.getSignalIdx('main.root')].toString()).toEqual(root.toString())
                expect(circuit.checkWitness(witness)).toBeTruthy()
            }
        })

        it('should return error with invalid proof', async () => {
            const tree = new MerkleTree(DEPTH, ZERO_VALUE)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const randVal = Math.floor(Math.random() * 1000)
                const leaf = hashOne(randVal)
                tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = tree.root

            for (let i = 0; i < 2 ** DEPTH; i++) {
                const proof = tree.getPathUpdate(i)
                const circuitInputs = {
                    leaf: leaves[i],
                    // swapped proof
                    path_elements: proof[1],
                    path_index: proof[0],
                    root
                }

                expect(() => {
                    circuit.calculateWitness(circuitInputs)
                }).toThrow()
            }
        })
    })
})

