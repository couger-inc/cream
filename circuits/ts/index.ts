import * as path from 'path'
import * as compiler from 'circom'
import { Circuit } from 'snarkjs'
import { SnarkBigInt } from 'libcream'

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
