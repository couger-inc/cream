import * as snarkjs from 'snarkjs'
import * as crypto from 'crypto'
import * as ethers from 'ethers'
import { babyJub, mimcsponge, pedersenHash as circomPedersenHash } from 'circomlib'
import { MerkleTree } from './MerkleTree'

interface Deposit {
    nullifier: SnarkBigInt,
    secret: SnarkBigInt,
    preimage: SnarkBigInt,
    commitment: SnarkBigInt,
    nullifierHash: SnarkBigInt
}

interface PedersenHash {
    babyJubX: SnarkBigInt,
    babyJubY: SnarkBigInt
}

type SnarkBigInt = snarkjs.bigInt

const bigInt = snarkjs.bigInt

// prime number for babyjubjub ec
const SNARK_FIELD_SIZE = bigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

// should be 2558267815324835836571784235309882327407732303445109280607932348234378166811
const NOTHING_UP_MY_SLEEVE =
    bigInt(ethers.utils.solidityKeccak256(['bytes'], [ethers.utils.toUtf8Bytes('cream')])) % SNARK_FIELD_SIZE

const hashOne = (
    preImage: SnarkBigInt
): SnarkBigInt => {
    return mimcsponge.multiHash([preImage], 0, 1)
}

const hashLeftRight = (
    left: SnarkBigInt,
    right: SnarkBigInt
): SnarkBigInt => {
    return mimcsponge.multiHash([left, right], 0, 1)
}

const pedersenHash = (
    value: SnarkBigInt
): PedersenHash => {
    const hashed = circomPedersenHash.hash(value)
    const result = babyJub.unpackPoint(hashed)

    return {
        babyJubX: result[0],
        babyJubY: result[1]
    }
}

const rbigInt = (
    nbytes: number
): SnarkBigInt => {
    return bigInt.leBuff2int(crypto.randomBytes(nbytes))
}

const createDeposit = (
    nullifier: SnarkBigInt,
    secret: SnarkBigInt
): Deposit => {
    const preimage = Buffer.concat([nullifier.leInt2Buff(31), secret.leInt2Buff(31)])
    const commitment = pedersenHash(preimage)
    const nullifierHash = pedersenHash(nullifier.leInt2Buff(31))

    return {
        nullifier,
        secret,
        preimage,
        commitment: commitment.babyJubX,
        nullifierHash: nullifierHash.babyJubX
    }
}

export {
    MerkleTree,
    SnarkBigInt,
    bigInt,
    SNARK_FIELD_SIZE,
    NOTHING_UP_MY_SLEEVE,
    hashOne,
    hashLeftRight,
    pedersenHash,
    rbigInt,
    createDeposit,
}
