import { expect, assert } from 'chai'
import {
  loadSymbols,
  getWitnessCalculator,
} from './TestUtil';
import { MerkleTree } from 'cream-merkle-tree'
import { SnarkBigInt, toHex } from 'libcream'

import { poseidon } from 'circomlibjs'

const LEVELS = 4
const ZERO_VALUE = 0

describe('MerkleTree circuit', () => {
  describe('HashLeftRight', () => {
    it('should hash correctly', async () => {
      const circuitInputs = {
        left: 12345,
        right: 45678,
      }

      const circuit = 'merkleTreeHashLeftRight_test'
      const wc = await getWitnessCalculator(circuit)
      const symbols = loadSymbols(circuit)
      const witness = await wc.calculateWitness(circuitInputs)

      const circuitHash = witness[symbols['main.hash']]
      const jsHash = poseidon([circuitInputs.left, circuitInputs.right])

      expect(circuitHash.toString()).to.equal(jsHash.toString())
    })
  })

  describe('LeafExists', () => {
    it('should work with valid input for LeafExists', async () => {
      const circuit = 'merkleTreeLeafExists_test'
      const wc = await getWitnessCalculator(circuit)
      const symbols = loadSymbols(circuit)

      const tree = new MerkleTree(LEVELS, ZERO_VALUE)
      let leaves: SnarkBigInt[] = []

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const randVal = Math.floor(Math.random() * 1000)
        const leaf = poseidon([randVal])
        tree.insert(leaf)
        leaves.push(leaf)
      }

      const root = tree.root

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const proof = tree.getPathUpdate(i)
        const circuitInputs = {
          leaf: leaves[i],
          path_elements: proof[0],
          path_index: proof[1],
          root,
        }

        const witness = await wc.calculateWitness(circuitInputs)
        const circuitRoot = witness[symbols['main.root']]
        expect(circuitRoot.toString()).to.equal(root.toString())
      }
    })

    it('should return error with invalid LeafExists input', async () => {
      const circuit = 'merkleTreeLeafExists_test'
      const wc = await getWitnessCalculator(circuit)

      const tree = new MerkleTree(LEVELS, ZERO_VALUE)
      let leaves: SnarkBigInt[] = []

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const randVal = Math.floor(Math.random() * 1000)
        const leaf = poseidon([randVal])
        tree.insert(leaf)
        leaves.push(leaf)
      }

      const root = tree.root

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const proof = tree.getPathUpdate(i)

        const circuitInputs = {
          leaf: leaves[i],
          // swapping input elements
          path_elements: proof[1],
          path_index: proof[0],
          root,
        }

        try {
          await wc.calculateWitness(circuitInputs)
          assert.fail("wc.calculatedWitness did not throw exception")
        } catch {}
      }
    })
  })

  describe('CheckRoot', () => {
    const circuit = 'merkleTreeCheckRoot_test'
    let wc, symbols

    before(async () => {
      wc = await getWitnessCalculator(circuit)
      symbols = loadSymbols(circuit)
    })

    it('should return valid root', async () => {
      const tree = new MerkleTree(LEVELS, ZERO_VALUE)
      let leaves: SnarkBigInt[] = []

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const randVal = Math.floor(Math.random() * 1000)
        const leaf = poseidon([randVal])
        tree.insert(leaf)
        leaves.push(leaf)
      }

      const root = tree.root

      const circuitInputs = { leaves }
      const witness = await wc.calculateWitness(circuitInputs)

      expect(witness[symbols['main.root']].toString()).to.equal(root.toString())
    })

    it('should generate different root from different leaves', async () => {
      const tree = new MerkleTree(LEVELS, ZERO_VALUE)
      let leaves: SnarkBigInt[] = []

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const randVal = Math.floor(Math.random() * 1000)
        const leaf = poseidon([randVal])
        tree.insert(leaf)

        // Give the circuit a different leaf
        leaves.push(toHex(randVal + 1, 32))
      }

      const root = tree.root
      const circuitInputs = { leaves }
      const witness = await wc.calculateWitness(circuitInputs)

      expect(
        witness[symbols['main.root']].toString()
      ).not.to.equal(root.toString())
    })
  })

  describe('MerkleTree', () => {
    const circuit = 'merkleTree_test'
    let wc, symbols

    before(async () => {
      wc = await getWitnessCalculator(circuit)
      symbols = loadSymbols(circuit)
    })

    it('should work with valid input', async () => {
      const tree = new MerkleTree(LEVELS, ZERO_VALUE)
      let leaves: SnarkBigInt[] = []

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const randVal = Math.floor(Math.random() * 1000)
        const leaf = poseidon([randVal])
        tree.insert(leaf)
        leaves.push(leaf)
      }

      const root = tree.root

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const proof = tree.getPathUpdate(i)
        const circuitInputs = {
          leaf: leaves[i],
          path_elements: proof[0],
          path_index: proof[1],
        }
        const witness = await wc.calculateWitness(circuitInputs)

        expect(witness[symbols['main.root']].toString()).to.equal(
          root.toString()
        )
      }
    })

    it('should return error with invalid proof', async () => {
      const tree = new MerkleTree(LEVELS, ZERO_VALUE)
      let leaves: SnarkBigInt[] = []

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const randVal = Math.floor(Math.random() * 1000)
        const leaf = poseidon([randVal])
        tree.insert(leaf)
        leaves.push(leaf)
      }

      for (let i = 0; i < 2 ** LEVELS; i++) {
        const proof = tree.getPathUpdate(i)
        const circuitInputs = {
          leaf: leaves[i],
          // swapped proof
          path_elements: proof[1],
          path_index: proof[0],
        }
        try {
          await wc.calculateWitness(circuitInputs)
          assert.fail("wc.calculatedWitness did not throw exception")
        } catch {}
      }
    })
  })
})
