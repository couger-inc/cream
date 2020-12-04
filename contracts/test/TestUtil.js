const fs = require('fs')
const path = require('path')
const circomlib = require('circomlib')
const crypto = require('crypto')

const { bigInt, pedersenHash, rbigInt } = require('libcream')

const send = (method, params = []) => {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line no-undef
        web3.currentProvider.send(
            {
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params,
            },
            (err, res) => {
                return err ? reject(err) : resolve(res)
            }
        )
    })
}

const takeSnapshot = async () => {
    return await send('evm_snapshot')
}

const revertSnapshot = async (id) => {
    await send('evm_revert', [id])
}

module.exports = {
    takeSnapshot,
    revertSnapshot,
}
