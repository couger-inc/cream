// Original code
// https://github.com/appliedzkp/maci/blob/master/circuits/ts/index.ts

import * as path from 'path'
import { SnarkBigInt } from 'libcream'

const tester = require('circom').tester

const compileAndLoadCircuit = async (
    circuitFilename: string
) => {
    const circuit = await tester(
        path.join(
            __dirname,
            'circuits',
            `../../circom/test/${circuitFilename}`,
        ),
    )
    await circuit.loadSymbols()
    return circuit

}

const executeCircuit = async (
    circuit: any,
    input: any,
) => {
    const witness = await circuit.calculateWitness(input)
    await circuit.checkConstraints(witness)
    await circuit.loadSymbols()
    return witness
}

export {
    SnarkBigInt,
    compileAndLoadCircuit,
    executeCircuit
}
