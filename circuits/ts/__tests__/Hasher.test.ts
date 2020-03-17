import {
    SnarkBigInt,
    compileAndLoadCircuit
} from '../'
import {
    SNARK_FIELD_SIZE,
    createDeposit,
    rbigInt
} from '../../../lib'

describe('MiMC hash circuits', () => {
    let circuit

    describe('Hasher', () => {
        it('should return correct hashed values', async () => {
            circuit = await compileAndLoadCircuit('hasher_test.circom')

            const nullifier = rbigInt(31)
            const nullifier_buf = nullifier.leInt2Buff(31)
            const secret = rbigInt(31)
            const preimage = Buffer.concat([nullifier_buf, secret.leInt2Buff(31)])

            const deposit = createDeposit(nullifier, secret)

            const circuitInputs = {
                nullifier,
                secret
            }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(witness[circuit.getSignalIdx('main.commitment')].toString()).toEqual(deposit.commitment.toString())
            expect(witness[circuit.getSignalIdx('main.nullifierHash')].toString()).toEqual(deposit.nullifierHash.toString())
        })
    })
})







