const circomlib = require('circomlib')
const mimcsponge = circomlib.mimcsponge
const snarkjs = require('snarkjs')
const bigInt = snarkjs.bigInt

class MimcSpongeHasher {
  hash(level, left, right) {
    return mimcsponge.multiHash([bigInt(left), bigInt(right)]).toString()
  }

  hashOne(preImage) {
    return mimcsponge.multiHash([bigInt(preImage)], 0, 1)
  }
}

module.exports = MimcSpongeHasher
