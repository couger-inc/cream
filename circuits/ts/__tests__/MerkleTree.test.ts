import {
    SnarkBigInt,
    compileAndLoadCircuit
} from '../'
import {
    MerkleTree,
    hashOne
} from '../../../lib'
import { toFixedHex } from '../../../contracts/test/TestUtil'

const DEPTH = 4
const ZERO_VALUE = 0


describe('MerkleTree circuit', () => {
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

