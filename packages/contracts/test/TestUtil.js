const { unstringifyBigInts } = require('@cream/circuits')
const { bigInt, pedersenHash, rbigInt } = require('libcream')

const ipfsClient = require('ipfs-http-client')
const ipfs = ipfsClient('http://localhost:5001')

const RECIPIENTS = [
    '0x65A5B0f4eD2170Abe0158865E04C4FF24827c529',
    '0x9cc9C78eDA7c7940f968eF9D8A90653C47CD2a5e',
    '0xb97796F8497bb84C63e650E9527Be587F18c09f8',
]

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
    RECIPIENTS,
    formatProofForVerifierContract,
    takeSnapshot,
    revertSnapshot,
    timeTravel,
    getIpfsHash,
    getDataFromIpfsHash,
}
