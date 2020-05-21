const fs = require('fs')
const path = require('path')
const { toBN, randomHex } = require('web3-utils')
const config = require('config')
const websnarkUtils = require('websnark/src/utils')
const buildGroth16 = require('websnark/src/groth16')
const stringifyBigInts = require('websnark/tools/stringifybigint').stringifyBigInts

const Cream = artifacts.require('./Cream.sol')
const SignUpToken = artifacts.require('./SignUpToken.sol')
const Verifier = artifacts.require('./Verifier.sol')

const {
  MerkleTree,
  bigInt,
  createDeposit,
  pedersenHash,
  rbigInt
} = require('cream-lib')

const {
  toFixedHex,
  getRandomRecipient,
  snarkVerify,
  revertSnapshot,
  takeSnapshot
} = require('./TestUtil')

const truffleAssert = require('truffle-assertions')

const loadVk = (binName) => {
  const p = path.join(__dirname, '../../build/circuits/' + binName + '.bin')
  return fs.readFileSync(p).buffer
}

contract('Cream', accounts => {
  let instance
  let tokenContract
  let snapshotId
  let proving_key
  let tree
  let groth16
  let circuit
  const LEVELS = config.MERKLE_TREE_HEIGHT
  const ZERO_VALUE = config.ZERO_VALUE
  const value = config.DENOMINATION
  let recipient = config.RECIPIENTS[0]
  const fee = bigInt(value).shr(0)
  const contractOwner = accounts[0]
  const voter = accounts[1]
  const relayer = accounts[2]
  const badUser = accounts[3]
  const voter2 = accounts[4]

  before(async () => {
    tree = new MerkleTree(
      LEVELS,
      ZERO_VALUE
    )
    instance = await Cream.deployed()
    tokenContract = await SignUpToken.deployed()
    snapshotId = await takeSnapshot()
    groth16 = await buildGroth16()
    circuit = require('../../build/circuits/vote.json')
    proving_key = loadVk('vote_proving_key')
  })

  beforeEach(async () => {
    await tokenContract.giveToken(voter)
    await tokenContract.setApprovalForAll(instance.address, true, { from: voter })
  })

  describe('initialize', () => {
    it('should correctly initialize', async () => {
      const denomination = await instance.denomination()
      assert.equal(denomination, value)
    })

    it('should return correct signuptoken address', async () => {
      const tokenAddress = await instance.signUpToken.call()
      assert.equal(tokenAddress, tokenContract.address)
    })

    it('should return correct current token supply amount', async () => {
      const crrSupply = await tokenContract.getCurrentSupply()
      assert.equal(crrSupply.toString(), 2)
    })

    it('should return corret token owner address', async () => {
      const ownerOfToken1 = await tokenContract.ownerOf(1)
      assert.equal(ownerOfToken1, voter)
    })

    it('should return correct recipient address', async () => {
      const expected = recipient
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
        await instance.updateVerifier(newVerifier.address, {from: voter})
      } catch(error) {
        assert.equal(error.reason, 'Ownable: caller is not the owner')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  describe('deposit', () => {
    it('should correctly emit event', async () => {
      const commitment = toFixedHex(42)
      const tx = await instance.deposit(commitment, {from: voter})
      // truffleAssert.prettyPrintEmittedEvents(tx)
      truffleAssert.eventEmitted(tx, 'Deposit')
    })

    it('should return correct index', async () => {
      let commitment = toFixedHex(42)
      const tx = await instance.deposit(commitment, {from: voter})
      assert.equal(bigInt(tx.logs[0].args.leafIndex), 0)
    })

    it('should be able to find deposit event from commietment', async () => {
      const commitment1 = toFixedHex(42)
      const tx1 = await instance.deposit(commitment1, {from: voter})

      // voter 2 deposit
      await tokenContract.giveToken(voter2)
      await tokenContract.setApprovalForAll(instance.address, true, { from: voter2 })
      const commitment2 = toFixedHex(43)
      const tx2 = await instance.deposit(commitment2, {from: voter2})

      // TODO : load `gemerateMerkleProof` function from cream-lib
      const events = await instance.getPastEvents('Deposit', { fromBlock: 0 })
      const leaves = events
	    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex)
	    .map(e => e.returnValues.commitment)

      for (let i = 0; i < leaves.length; i++) {
	tree.insert(leaves[i])
      }

      let depositEvent = events.find(e => e.returnValues.commitment === commitment1)
      let leafIndex = depositEvent.returnValues.leafIndex

      assert.equal(leafIndex, bigInt(tx1.logs[0].args.leafIndex))

      depositEvent = events.find(e => e.returnValues.commitment === commitment2)
      leafIndex = depositEvent.returnValues.leafIndex

      assert.equal(leafIndex, bigInt(tx2.logs[0].args.leafIndex))

    })

    it('should throw an error for non-token holder', async () => {
      const commitment = toFixedHex(42)
      try {
	await instance.deposit(commitment, {from: badUser})
      } catch(error) {
	assert.equal(error.reason, 'Sender does not own appropreate amount of token')
	return
      }
      assert.fail('Expected revert not received')
    })

    // voter and bad user collude pattern
    it('should throw an error for more than two tokens holder', async () => {
      await tokenContract.giveToken(badUser);
      await tokenContract.setApprovalForAll(instance.address, true, { from: badUser })
      await tokenContract.setApprovalForAll(badUser, true, { from: voter })
      await tokenContract.safeTransferFrom(voter, badUser, 1, {from: voter})

      const commitment = toFixedHex(42)
      try {
	await instance.deposit(commitment, {from: badUser})
      } catch(error) {
	assert.equal(error.reason, 'Sender does not own appropreate amount of token')
	return
      }
      assert.fail('Expected revert not received')

      const balance = await tokenContract.balanceOf(badUser)
      assert.equal(2, balance)
    })

    it('should throw an error for same commitment submittion', async () => {
      const commitment = toFixedHex(42)
      await instance.deposit(commitment, {from: voter})
      try {
        await instance.deposit(commitment, {from: voter})
      } catch(error) {
        assert.equal(error.reason, 'Already submitted')
        return
      }
      assert.fail('Expected revert not received')
    })
  })

  describe('snark proof verification on js side', () => {
    it('should detect tampering', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      tree.insert(deposit.commitment)
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: deposit.nullifierHash,
        nullifier: deposit.nullifier,
        relayer: relayer,
        recipient,
        fee,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })
      let proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const originalProof = JSON.parse(JSON.stringify(proofData))
      let result = snarkVerify(proofData)
      assert.equal(result, true)

      /* fake public signal */
      proofData.publicSignals[1] = '133792158246920651341275668520530514036799294649489851421007411546007850802'
      result = snarkVerify(proofData)
      assert.equal(result, false)
    })
  })

  describe('withdraw', () => {
    it('should correctly work and emit event', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
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
        toFixedHex(input.fee)
      ]

      const tx = await instance.withdraw(proof, ...args, { from: relayer })
      // truffleAssert.prettyPrintEmittedEvents(tx)
      truffleAssert.eventEmitted(tx, 'Withdrawal')
      isSpent = await instance.isSpent(toFixedHex(input.nullifierHash))
      assert.isTrue(isSpent)
    })

    it('should correctly transfer token to recipient', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })


      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(input.root),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee)
      ]

      await instance.withdraw(proof, ...args, { from: relayer })
      const newTokenOwner = await tokenContract.ownerOf(1)
      assert.equal(recipient, newTokenOwner)
    })

    it('should prevent excess withdrawal', async() => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const fake = bigInt('2000000000000000000')
      const args = [
        toFixedHex(input.root),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(fake)
      ]

      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.reason, 'Fee exceeds transfer value')
        return
      }
      assert.fail('Expected revert not received')
    })

    it('should prevent double spend', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(input.root),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee)
      ]
      await instance.withdraw(proof, ...args, { from: relayer })
      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.reason, 'The note has been already spent')
        return
      }
      assert.fail('Expected revert not received')
    })

    it('should prevent double sepnd with overflow', async () => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(input.root),
        toFixedHex(toBN(input.nullifierHash).add(toBN('21888242871839275222246405745257275088548364400416034343698204186575808495617'))),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee)
      ]

      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.reason, 'verifier-gte-snark-scalar-field')
        return
      }
      assert.fail('Expected revert not received')
    })

    it('should throw for corrupted merkle tree root', async() => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      const args = [
        toFixedHex(randomHex(32)),
        toFixedHex(input.nullifierHash),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee)
      ]
      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.reason,'Cannot find your merkle root')
        return
      }
      assert.fail('Expected revert not received')

    })

    it('should reject tampered public input on contract side', async() => {
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
      })
      const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
      const { proof } = websnarkUtils.toSolidityInput(proofData)

      // incorrect nullifierHash, using constant hash value
      let incorrectArgs = [
        toFixedHex(input.root),
        toFixedHex('0x00abdfc78211f8807b9c6504a6e537e71b8788b2f529a95f1399ce124a8642ad'),
        toFixedHex(input.recipient, 20),
        toFixedHex(input.relayer, 20),
        toFixedHex(input.fee)
      ]

      try {
        await instance.withdraw(proof, ...incorrectArgs, { from: relayer })
      } catch(error) {
        assert.equal(error.reason, 'Invalid withdraw proof')
        return
      }
      assert.fail('Expected revert not received')


    })

    it('should throw an error with random recipient', async() => {
      recipient = getRandomRecipient()
      const deposit = createDeposit(rbigInt(31), rbigInt(31))
      await tree.insert(deposit.commitment)
      await instance.deposit(toFixedHex(deposit.commitment), { from: voter })
      const root = tree.root
      const merkleProof = tree.getPathUpdate(0)
      const input = stringifyBigInts({
        root,
        nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)).babyJubX,
        relayer: relayer,
        recipient,
        fee,
        nullifier: deposit.nullifier,
        secret: deposit.secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1]
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
        toFixedHex(input.fee)
      ]

      try {
        await instance.withdraw(proof, ...args, { from: relayer })
      } catch(error) {
        assert.equal(error.reason, 'Recipient do not exist')
        return
      }
      assert.fail('Expected revert not received')
      // truffleAssert.prettyPrintEmittedEvents(tx)
      truffleAssert.eventEmitted(tx, 'Withdrawal')
      isSpent = await instance.isSpent(toFixedHex(input.nullifierHash))
      assert.isTrue(isSpent)
    })
  })

  afterEach(async () => {
    await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    snapshotId = await takeSnapshot()
    tree = new MerkleTree(
      LEVELS,
      ZERO_VALUE
    )
  })
})
