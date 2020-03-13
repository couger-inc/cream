import * as fs from 'fs'
import * as path from 'path'
import { Circuit } from 'snarkjs'
const compiler = require('circom')

const compileAndLoadCircuit = async (
    circuitFilename: string
) => {
    const circuitDef = await compiler(path.join(__dirname, 'circuits', `../../circom/test/${circuitFilename}`))
    return new Circuit(circuitDef)
}

export {
    compileAndLoadCircuit
}


