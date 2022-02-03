import { createDeposit, rbigInt } from 'libcream'
import { expect } from 'chai'
import {
  getWitnessCalculator,
  loadSymbols,
} from './TestUtil';

describe('MiMC hash circuits', () => {
  describe('Hasher', () => {

    it('should return correct hashed values', async () => {
      const LENGTH = 31
      const nullifier = rbigInt(LENGTH)
      const secret = rbigInt(LENGTH)
      const deposit = createDeposit(nullifier, secret)

      const circuitInputs = {
        nullifier: nullifier.toString(),
        secret: secret.toString(),
      }

      const circuit = 'hasher_test'
      const wc = await getWitnessCalculator(circuit)
      const symbols = loadSymbols(circuit)
      const witness = await wc.calculateWitness(circuitInputs)

      expect(witness[symbols['main.commitment']]).to.equal(deposit.commitment)
      expect(witness[symbols['main.nullifierHash']]).to.equal(deposit.nullifierHash)
    })
  })
})
