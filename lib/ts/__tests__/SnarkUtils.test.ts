import {
    createDeposit,
    pedersenHash,
    SNARK_FIELD_SIZE,
    //    NOTHING_UP_MY_SLEEVE,
    hashOne,
    hashLeftRight,
    rbigInt,
} from '../'

describe('Snark utilities', () => {
    describe('hashing', () => {
        it('the hash size of random number should be smaller than the snark field size', () => {
            const h_one = hashOne(rbigInt(Math.floor(Math.random() * 1000)))
            expect(h_one.lt(SNARK_FIELD_SIZE)).toBeTruthy()

            const h_lr = hashLeftRight(rbigInt(Math.floor(Math.random() * 1000)), rbigInt(Math.floor(Math.random() * 1000)))
            expect(h_lr.lt(SNARK_FIELD_SIZE)).toBeTruthy()
        })
    })

    describe('Deposit object creation', () => {
        it('should return `Deposit` object correctly', () => {
            const nullifier = rbigInt(31)
            const nullifier_buf = nullifier.leInt2Buff(31)
            const secret = rbigInt(31)
            const preimage = Buffer.concat([nullifier_buf, secret.leInt2Buff(31)])

            const deposit = createDeposit(nullifier, secret)

            expect(deposit.commitment.toString()).toEqual(pedersenHash(preimage).babyJubX.toString())
            expect(deposit.nullifierHash.toString()).toEqual(pedersenHash(nullifier_buf).babyJubX.toString())
        })
    })

    // TODO: create perdersenHash & rbigint test
    //    describe('pedersenHash', () => {
    //    * create test with contract or circuit to verify hash
    //    })

    //    describe('', () => {
    //    })
})
