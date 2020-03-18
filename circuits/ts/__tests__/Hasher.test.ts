import {
    compileAndLoadCircuit
} from '../'
import {
    createDeposit,
    rbigInt
} from '../../../lib'

const LENGTH = 31

describe('MiMC hash circuits', () => {
    let circuit

    describe('Hasher', () => {
        it('should return correct hashed values', async () => {
            circuit = await compileAndLoadCircuit('hasher_test.circom')

            const nullifier = rbigInt(LENGTH)
            const secret = rbigInt(LENGTH)
            const deposit = createDeposit(nullifier, secret)

            const circuitInputs = {
                nullifier,
                secret
            }

            const witness = circuit.calculateWitness(circuitInputs)
            expect(witness[circuit.getSignalIdx('main.commitment')].toString()).toEqual(deposit.commitment.toString())
            expect(witness[circuit.getSignalIdx('main.nullifierHash')].toString()).toEqual(deposit.nullifierHash.toString())
        })

        it('should return error with invalid bytes length input', async () => {
            circuit = await compileAndLoadCircuit('hasher_test.circom')

            const INVALID_LENGTH = LENGTH + 1
            const nullifier = rbigInt(INVALID_LENGTH)
            const secret = rbigInt(INVALID_LENGTH)

            const circuitInputs = {
                nullifier,
                secret
            }

            expect(() => {
                circuit.calculateWitness(circuitInputs)
            }).toThrow()
        })
    })
})







