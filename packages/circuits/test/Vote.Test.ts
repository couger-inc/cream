import { expect } from 'chai'
import {
  loadSymbols,
  getWitnessCalculator,
} from './TestUtil';
import { config } from '@cream/config'
import { MerkleTree } from 'cream-merkle-tree'
import { SnarkBigInt } from 'libcream'
import {
  VoteCircuitInputs,
  generateVote,
} from '../ts'


describe('Vote circuits', () => {
  describe('Vote(4)', () => {
    it('should return correct root', async () => {
      const LEVELS = 4
      const ZERO_VALUE: string = config.cream.zeroValue

      const tree = new MerkleTree(LEVELS, ZERO_VALUE)

      const circuit = 'vote_test'
      const wc = await getWitnessCalculator(circuit)
      const symbols = loadSymbols(circuit)

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const circuitInputs: VoteCircuitInputs = generateVote(tree, i)
        const witness = await wc.calculateWitness(circuitInputs)

        const circuitRoot: SnarkBigInt = witness[symbols['main.root']]

        expect(circuitRoot.toString()).to.equal(circuitInputs.root.toString())
      }
    })
  })
})
