const { unstringifyBigInts } = require('@cream/circuits')
const { bigInt, pedersenHash, rbigInt } = require('libcream')

const ipfsClient = require('ipfs-http-client')
const ipfs = ipfsClient('http://localhost:5001')

const formatProofForVerifierContract = (_proof) => {
    return [
        _proof.pi_a[0],
        _proof.pi_a[1],
        _proof.pi_b[0][1],
        _proof.pi_b[0][0],
        _proof.pi_b[1][1],
        _proof.pi_b[1][0],
        _proof.pi_c[0],
        _proof.pi_c[1],
    ].map((x) => x.toString())
}

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

const timeTravel = async (seconds) => {
    await send('evm_increaseTime', seconds)
    await send('evm_mine')
}

const getIpfsHash = async (obj) => {
    return (await ipfs.add(obj)).path.toString()
}

const getDataFromIpfsHash = async (hash) => {
    const stream = ipfs.cat(hash)
    let data = ''
    for await (const chunk of stream) {
        data += chunk.toString()
    }
    return data
}

module.exports = {
    formatProofForVerifierContract,
    takeSnapshot,
    revertSnapshot,
    timeTravel,
    getIpfsHash,
    getDataFromIpfsHash,
}
