import * as path from 'path'
import { Circuit, snarkjs } from 'snarkjs'
const compiler = require('circom')

type SnarkBigInt = snarkjs.bigInt

const compileAndLoadCircuit = async (
    circuitFilename: string
) => {
    const circuitDef = await compiler(path.join(__dirname, 'circuits', `../../circom/test/${circuitFilename}`))
    return new Circuit(circuitDef)
}

export {
    SnarkBigInt,
    compileAndLoadCircuit
}


