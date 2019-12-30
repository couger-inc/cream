const fs = require('fs')
const { toBN } = require('web3-utils')
const { DENOMINATION, MERKLE_TREE_HEIGHT } = process.env
const MerkleTree = require('../lib/MerkleTree')
const { bigInt, createDeposit, pedersenHash, rbigint } = require('../lib/SnarkUtils')
const { toFixedHex, getRandomRecipient, snarkVerify, revertSnapshot, takeSnapshot } = require('./TestUtil')
const websnarkUtils = require('websnark/src/utils')
const buildGroth16 = require('websnark/src/groth16')
const stringifyBigInts = require('websnark/tools/stringifybigint').stringifyBigInts
const Cream = artifacts.require('./Cream.sol')
const Verifier = artifacts.require('./Verifier.sol')
const truffleAssert = require('truffle-assertions')

contract('Cream', accounts => {
  let instance
  let snapshotId
  let proving_key
  let tree
  let groth16
  let circuit
  const prefix = 'test'
  const levels = MERKLE_TREE_HEIGHT || 4
  const value = DENOMINATION || '1000000000000000000' // 1 ether
  const recipient = getRandomRecipient()
  const fee = bigInt(value).shr(1)
  const refund = bigInt(0)
  const relayer = accounts[1]

  before(async () => {
    tree = new MerkleTree(
      levels,
      null,
      prefix,
    )
    instance = await Cream.deployed()
    snapshotId = await takeSnapshot()
    groth16 = await buildGroth16()
    circuit = require('../build/circuits/vote.json')
    proving_key = fs.readFileSync('build/circuits/vote_proving_key.bin').buffer
  })

  describe('contructor', () => {
    it('should initialize', async () => {
      const denomination = await instance.denomination()
      assert.equal(denomination, value)
    })

    it('should return correct address', async () => {
      const expected = "0x65A5B0f4eD2170Abe0158865E04C4FF24827c529"
      const returned = await instance.recipients(0)
      assert.equal(expected, returned)
    })

    it('should be able to update verifier contract by owner', async () => {
      const oldVerifier = await instance.verifier()
      const newVerifier = await Verifier.new()
      await instance.updateVerifier(newVerifier.address)
      const result = await instance.verifier()
      assert.notEqual(oldVerifier, result)
    })

    it('should prevent update verifier contract by non-owner', async () => {
      const newVerifier = await Verifier.new()
      try {
        await instance.updateVerifier(newVerifier.address, {from: accounts[2]})
      } catch(error) {
        assert.equal(error.message, 'Returned error: VM Exception while processing transaction: revert Ownable: caller is not the owner -- Reason given: Ownable: caller is not the owner.')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  describe('deposit', () => {
    it('should emit event', async () => {
      const commitment = toFixedHex(42)
      const tx = await instance.deposit(commitment, {value, from: accounts[0]})
      truffleAssert.prettyPrintEmittedEvents(tx)
      truffleAssert.eventEmitted(tx, 'Deposit')
    })

    it('should return correct index', async () => {
      let commitment = toFixedHex(42)
      await instance.deposit(commitment, {value, from: accounts[0]})
      commitment = toFixedHex(12)
      const tx = await instance.deposit(commitment, {value, from: accounts[0]})
      assert.equal(bigInt(tx.logs[0].args.leafIndex), 1)

    })

    it('should throw an error', async () => {
      const commitment = toFixedHex(42)
      await instance.deposit(commitment, {value, from: accounts[0]})
      try {
        await instance.deposit(commitment, {value, from: accounts[0]})
      } catch(error) {
        assert.equal(error.message, 'Returned error: VM Exception while processing transaction: revert already submitted -- Reason given: already submitted.')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  describe('snark proof verification on js side', () => {
    it('should detect tampering', async () => {
      const deposit = createDeposit(rbigint(31), rbigint(31))
      await tree.insert(deposit.commitment)
      const { root, path_elements, path_index } = await tree.path(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: deposit.nullifierHash,
        nullifier: deposit.nullifier,
        relayer: accounts[1],
        recipient,
        fee,
        refund,
        secret: deposit.secret,
        pathElements: path_elements,
        pathIndices: path_index
      })
      let proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const originalProof = JSON.parse(JSON.stringify(proofData))
      let result = snarkVerify(proofData)
      assert.equal(result, true)

      proofData.publicSignals[1] = '133792158246920651341275668520530514036799294649489851421007411546007850802'
      result = snarkVerify(proofData)
      assert.equal(result, false)
    })
  })

  describe('withdraw', () => {
    it('should work', async () => {
      const deposit = createDeposit(rbigint(31), rbigint(31))
      const user = accounts[2]
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { value, from: user })
      const { root, path_elements, path_index } = await tree.path(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)),
        relayer: relayer,
        recipient,
        fee,
        refund,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        pathElements: path_elements,
        pathIndices: path_index,
      })
      let isSpent = await instance.isSpent(toFixedHex(input.nullifierHash))
      assert.isFalse(isSpent)

      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(input.root),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee),
        toFixedHex(input.refund)
      ]

      const tx = await instance.withdraw(proof, ...args, { from: relayer })
      truffleAssert.prettyPrintEmittedEvents(tx)
      truffleAssert.eventEmitted(tx, 'Withdrawal')
      isSpent = await instance.isSpent(toFixedHex(input.nullifierHash))
      assert.isTrue(isSpent)
    })

    it('should prevent excess withdrawal', async() => {
      const deposit = createDeposit(rbigint(31), rbigint(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { value, from: accounts[0] })
      const { root, path_elements, path_index } = await tree.path(0)

      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)),
        relayer: relayer,
        recipient,
        fee,
        refund,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        pathElements: path_elements,
        pathIndices: path_index,
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const fake = bigInt('2000000000000000000')
      const args = [
        toFixedHex(input.root),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(fake),
        toFixedHex(input.refund)
      ]

      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.message, 'Returned error: VM Exception while processing transaction: revert Fee exceeds transfer value -- Reason given: Fee exceeds transfer value.')
        return
      }
      assert.fail('Expected revert not received')
    })

    it('should prevent double spend', async () => {
      const deposit = createDeposit(rbigint(31), rbigint(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { value, from: accounts[0] })
      const { root, path_elements, path_index } = await tree.path(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)),
        relayer: relayer,
        recipient,
        fee,
        refund,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        pathElements: path_elements,
        pathIndices: path_index,
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(input.root),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee),
        toFixedHex(input.refund)
      ]
      await instance.withdraw(proof, ...args, { from: relayer })
      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.message, 'Returned error: VM Exception while processing transaction: revert The note has been already spent -- Reason given: The note has been already spent.')
        return
      }
      assert.fail('Expected revert not received')
    })

    it('should prevent double sepnd with overflow', async () => {
      const deposit = createDeposit(rbigint(31), rbigint(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { value, from: accounts[0] })
      const { root, path_elements, path_index } = await tree.path(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)),
        relayer: relayer,
        recipient,
        fee,
        refund,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        pathElements: path_elements,
        pathIndices: path_index,
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(input.root),
        toFixedHex(toBN(input.nullifierHash).add(toBN('21888242871839275222246405745257275088548364400416034343698204186575808495617'))),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee),
        toFixedHex(input.refund)
      ]

      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.message, 'Returned error: VM Exception while processing transaction: revert verifier-gte-snark-scalar-field -- Reason given: verifier-gte-snark-scalar-field.')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  afterEach(async () => {
    await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    snapshotId = await takeSnapshot()
    tree = new MerkleTree(
      levels,
      null,
      prefix,
    )
  })
})