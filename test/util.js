const snarkjs = require('snarkjs')
const bigInt = snarkjs.bigInt

const toFixedHex = (number, length=32) => {
  return '0x' + bigInt(number).toString(16).padStart(length * 2, '0')
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

const takeSnapshot = async () => {
  return await send('evm_snapshot')
}

const revertSnapshot = async (id) => {
  await send('evm_revert', [id])
}

module.exports = {
  revertSnapshot,
  takeSnapshot,
  toFixedHex,
}