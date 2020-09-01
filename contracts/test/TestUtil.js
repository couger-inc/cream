const circomlib = require('circomlib')
const crypto = require('crypto')
const snarkjs = require('snarkjs')
const unstringifyBigInts = require('snarkjs/src/stringifybigint').unstringifyBigInts

const {
  bigInt,
  pedersenHash,
  rbigInt
} = require('libcream')

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
  const verification_key = unstringifyBigInts(require('../../circuits/build/circuits/verification_key.json'))
  return snarkjs['groth'].isValid(verification_key, proof, proof.publicSignals)
}

const takeSnapshot = async () => {
  return await send('evm_snapshot')
}

const toFixedHex = (number, length=32) => {
  return '0x' + bigInt(number).toString(16).padStart(length * 2, '0')
}

module.exports = {
  snarkVerify,
  revertSnapshot,
  takeSnapshot,
}
