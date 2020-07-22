const circomlib = require('circomlib')
const crypto = require('crypto')
const { toHex } = require('web3-utils')
const snarkjs = require('snarkjs')
const unstringifyBigInts = require('snarkjs/src/stringifybigint').unstringifyBigInts

const {
  bigInt,
  pedersenHash,
  rbigInt
} = require('libcream')

const getRandomRecipient = () => {
  let recipient = rbigInt(20)
  while(toHex(recipient.toString()).length !== 42) {
    recipient = rbigInt(20)
  }
  return recipient
}

const revertSnapshot = async (id) => {
  await send('evm_revert', [id])
}

const send = (method, params = []) => {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    web3.currentProvider.send({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    }, (err, res) => {
      return err ? reject(err) : resolve(res)
    })
  })
}

const snarkVerify = (proof) => {
  proof = unstringifyBigInts(proof)
  const verification_key = unstringifyBigInts(require('../../build/circuits/vote_verification_key.json'))
  return snarkjs['groth'].isValid(verification_key, proof, proof.publicSignals)
}

const takeSnapshot = async () => {
  return await send('evm_snapshot')
}

const toFixedHex = (number, length=32) => {
  return '0x' + bigInt(number).toString(16).padStart(length * 2, '0')
}

module.exports = {
  toFixedHex,
  getRandomRecipient,
  snarkVerify,
  revertSnapshot,
  takeSnapshot,
}
