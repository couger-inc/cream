import snarkjs from 'snarkjs'
import { compileAndLoadCircuit } from '../'
import { MerkleTree } from '../../../lib/MerkleTree'
import { toFixedHex } from '../../../test/TestUtil'

const LEVELS = 4
const PREFIX = 'test'

type SnarkBigInt = snarkjs.bigInt

describe('MerkleTree circuit', () => {
    describe('LeafExists', () => {
        let circuit

        beforeAll(async () => {
            circuit = await compileAndLoadCircuit('merkleTreeLeafExists_test.circom')
        })

        it('should work with valid input for LeafExists', async () => {
            const tree = new MerkleTree(LEVELS, null, PREFIX)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)

                // TODO: use alternative hash function below instead of toFixedhex
                const leaf = toFixedHex(randVal)
                await tree.insert(leaf)
                leaves.push(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const index = tree.getIndexByElement(leaves[i])
                const { root, path_elements, path_index } = await tree.path(index)
                const circuitInputs = {
                    leaf: leaves[i],
                    path_elements,
                    path_index,
                    root
                }
                const witness = circuit.calculateWitness(circuitInputs)
                expect(circuit.checkWitness(witness)).toBeTruthy()
            }
        })

        it('should return error with invalid LeafExists input', async () => {
            const tree = new MerkleTree(LEVELS, null, PREFIX)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)

                // TODO: use alternative hash function below instead of toFixedhex
                const leaf = toFixedHex(randVal)
                await tree.insert(leaf)
                leaves.push(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const index = tree.getIndexByElement(leaves[i])
                const { root, path_elements, path_index } = await tree.path(index)
                const circuitInputs = {
                    leaf: leaves[i],
                    // swapping input elements
                    path_elements: path_index,
                    path_index: path_elements,
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
            const tree = new MerkleTree(LEVELS, null, PREFIX)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)

                // TODO: use alternative hash function below instead of toFixedhex
                const leaf = toFixedHex(randVal)
                await tree.insert(leaf)
                leaves.push(leaf)
            }

            const root = await tree.root()

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
            const tree = new MerkleTree(LEVELS, null, PREFIX)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)

                // TODO: use alternative hash function below instead of toFixedhex
                const leaf = toFixedHex(randVal)
                await tree.insert(leaf)

                // Give the circuit a different leaf
                leaves.push(toFixedHex(randVal + 1))
            }

            const root = await tree.root()
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
            const tree = new MerkleTree(LEVELS, null, PREFIX)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)

                // TODO: use alternative hash function below instead of toFixedhex
                const leaf = toFixedHex(randVal)
                await tree.insert(leaf)
                leaves.push(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const index = tree.getIndexByElement(leaves[i])
                const { root, path_elements, path_index } = await tree.path(index)
                const circuitInputs = {
                    leaf: leaves[i],
                    path_elements,
                    path_index,
                }

                const witness = circuit.calculateWitness(circuitInputs)
                expect(witness[circuit.getSignalIdx('main.root')].toString()).toEqual(root.toString())
                expect(circuit.checkWitness(witness)).toBeTruthy()
            }
        })

        it('should return error with invalid proof', async () => {
            const tree = new MerkleTree(LEVELS, null, PREFIX)
            let leaves: SnarkBigInt[] = []

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const randVal = Math.floor(Math.random() * 1000)

                // TODO: use alternative hash function below instead of toFixedhex
                const leaf = toFixedHex(randVal)
                await tree.insert(leaf)
                leaves.push(leaf)
            }

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const index = tree.getIndexByElement(leaves[i])
                const { path_elements, path_index } = await tree.path(index)
                const circuitInputs = {
                    leaf: leaves[i],
                    path_elements: path_index,
                    path_index: path_elements,
                }

                expect(() => {
                    circuit.calculateWitness(circuitInputs)
                }).toThrow()
            }
        })
    })
})

