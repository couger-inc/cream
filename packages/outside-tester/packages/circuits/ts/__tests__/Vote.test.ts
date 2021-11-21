import { config } from '@cream/config'
import { MerkleTree } from 'cream-merkle-tree'
import {
  SnarkBigInt,
  compileAndLoadCircuit,
  executeCircuit,
  CircuitInput,
  generateVote,
} from '../'

const LEVELS = 3 // config.cream.merkleTreeDepth
const ZERO_VALUE: string = config.cream.zeroValue

jest.setTimeout(50000)

describe('Vote circuits', () => {
  let tree, circuit

  beforeAll(() => {
    tree = new MerkleTree(LEVELS, ZERO_VALUE)
  })

  describe('Vote(3)', () => {
    it('should return correct root', async () => {
      circuit = await compileAndLoadCircuit('test/vote3.circom')

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
