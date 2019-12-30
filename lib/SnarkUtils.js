const circomlib = require('circomlib')
const snarkjs = require('snarkjs')
const bigInt = snarkjs.bigInt
const crypto = require('crypto')

const createDeposit = (nullifier, secret) => {
  let deposit = { nullifier, secret }
  deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
  return deposit
}

const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]
const rbigint = (nbytes) => bigInt.leBuff2int(crypto.randomBytes(nbytes))

module.exports = {
  bigInt,
  createDeposit,
  pedersenHash,
  rbigint,
}