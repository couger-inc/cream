// Many methods are derived from:
// https://github.com/appliedzkp/maci/blob/master/circuits/ts/index.ts
// Modified by Kazuaki Ishiguro for C.R.E.A.M
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { SnarkBigInt } from 'libcream'

const snarkjs = require('snarkjs')
const ff = require('ffjavascript')
const tester = require('circom').tester

const stringifyBigInts: (obj: object) => any = ff.utils.stringifyBigInts
const unstringifyBigInts: (obj: object) => any = ff.utils.unstringifyBigInts

const compileAndLoadCircuit = async (
    circuitFilename: string
) => {
    const circuit = await tester(
        path.join(
            __dirname,
            'circuits',
            `../../circom/${circuitFilename}`,
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

const genProofAndPublicSignals = async (
    inputs: any,
    circuitFileName: string,
    zkeyFilename: string,
    circuitWasmFilename: string,
    circuit?: any,
) => {
    const zkeyPath: string = path.join(__dirname, '../', zkeyFilename)
    const circuitWasmPath: string = path.join(__dirname, '../build/', circuitWasmFilename)
    const inputsJsonPath: string = path.join(__dirname, '../build/input.json')
    const wtnsPath: string = path.join(__dirname, '../build/witness.wtns')
    const witnessJsonPath: string = path.join(__dirname, '../build/witness.json')
    const publicJsonPath: string = path.join(__dirname, '../build/public.json')
    const proofPath: string = path.join(__dirname, '../build/proof.json')
    const snarkjsCmd: string = 'node ' + path.join(__dirname, '../node_modules/snarkjs/build/cli.cjs')

    if (!circuit) {
        circuit = await compileAndLoadCircuit(circuitFileName)
    }

    fs.writeFileSync(inputsJsonPath, JSON.stringify(stringifyBigInts(inputs)))

    // snarkjs wc [.wasm] [input.json] [witness.wtns]
    execSync(`${snarkjsCmd} wc ${circuitWasmPath} ${inputsJsonPath} ${wtnsPath}`)

    // snrakjs wej [witness.wtns] [witness.json]
    execSync(`${snarkjsCmd} wej ${wtnsPath} ${witnessJsonPath}`)

    // snarkjs g16p [.zkey] [witness.wtns] [proof.json] [public.json]
    execSync(`${snarkjsCmd} g16p ${zkeyPath} ${wtnsPath} ${proofPath} ${publicJsonPath} `)

    const witness = unstringifyBigInts(JSON.parse(fs.readFileSync(witnessJsonPath).toString()))
    const publicSignals = unstringifyBigInts(JSON.parse(fs.readFileSync(publicJsonPath).toString()))
    const proof = JSON.parse(fs.readFileSync(proofPath).toString())

    await circuit.checkConstraints(witness)

    // remove files
    execSync(`rm -f ${wtnsPath} `)
    execSync(`rm -f ${witnessJsonPath} `)
    execSync(`rm -f ${publicJsonPath} `)
    execSync(`rm -f ${proofPath} `)
    execSync(`rm -f ${inputsJsonPath} `)

    return {
        proof,
        publicSignals,
        witness,
        circuit
    }
}


export {
    SnarkBigInt,
    compileAndLoadCircuit,
    executeCircuit,
    genProofAndPublicSignals,
}
