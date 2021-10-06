jest.setTimeout(50000)
import { config } from '@cream/config'
import { MerkleTree } from 'cream-merkle-tree'
import {
    SnarkBigInt,
    compileAndLoadCircuit,
    executeCircuit,
    CircuitInput,
    generateVote,
} from '../'

const LEVELS: number = config.cream.merkleTrees.toString()
const ZERO_VALUE: number = config.cream.zeroValue

describe('Vote circuits', () => {
    let tree, circuit

    beforeAll(() => {
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
    })

    describe('Vote(4)', () => {
        it('should return correct root', async () => {
            circuit = await compileAndLoadCircuit('test/vote.circom')

            for (let i = 0; i < 2 ** LEVELS; i++) {
                const input: CircuitInput = generateVote(tree, i)
                const witness = await executeCircuit(circuit, input)
                const circuitRoot: SnarkBigInt =
                    witness[circuit.symbols['main.root'].varIdx]
                expect(circuitRoot.toString()).toEqual(input.root.toString())
            }
        })
    })
})
