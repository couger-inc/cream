// Many methods are derived from:
// https://github.com/appliedzkp/maci/blob/master/circuits/ts/index.ts
// Modified by Kazuaki Ishiguro for C.R.E.A.M
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { SnarkBigInt, createDeposit, rbigInt } from 'libcream'
import {
    genBatchUstProofAndPublicSignals,
    genQvtProofAndPublicSignals,
    getSignalByName,
    verifyBatchUstProof,
    verifyQvtProof,
} from 'maci-circuits'

const snarkjs = require('snarkjs')
const ff = require('ffjavascript')
const tester = require('circom').tester

const stringifyBigInts: (obj: object) => any = ff.utils.stringifyBigInts
const unstringifyBigInts: (obj: object) => any = ff.utils.unstringifyBigInts

interface Deposit {
    commitment: SnarkBigInt
    nullifierHash: SnarkBigInt
    nullifier: SnarkBigInt
    secret: SnarkBigInt
}

interface CircuitInput {
    root: SnarkBigInt
    nullifierHash: SnarkBigInt
    nullifier: SnarkBigInt
    secret: SnarkBigInt
    path_elements: any[any]
    path_index: any[any]
}

const generateVote = (
    merkleTree: any,
    index: number,
    length?: number
): CircuitInput => {
    // Default value of len
    const len = length ? length : 31

    // Create deposit
    const deposit: Deposit = createDeposit(rbigInt(len), rbigInt(len))

    const { commitment, nullifierHash, nullifier, secret } = deposit

    // Update merkleTree
    merkleTree.insert(commitment)
    const merkleProof = merkleTree.getPathUpdate(index)

    const input: CircuitInput = {
        root: merkleTree.root,
        nullifierHash,
        nullifier,
        secret: secret,
        path_elements: merkleProof[0],
        path_index: merkleProof[1],
    }

    return input
}

const compileAndLoadCircuit = async (circuitFilename: string) => {
    const circuit = await tester(
        path.join(__dirname, 'circuits', `../../circom/${circuitFilename}`)
    )
    await circuit.loadSymbols()
    return circuit
}

const executeCircuit = async (circuit: any, input: any) => {
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
    circuit?: any
) => {
    const zkeyPath: string = path.join(__dirname, '../', zkeyFilename)
    const circuitWasmPath: string = path.join(
        __dirname,
        '../build/',
        circuitWasmFilename
    )
    const inputsJsonPath: string = path.join(__dirname, '../build/input.json')
    const wtnsPath: string = path.join(__dirname, '../build/witness.wtns')
    const witnessJsonPath: string = path.join(
        __dirname,
        '../build/witness.json'
    )
    const publicJsonPath: string = path.join(__dirname, '../build/public.json')
    const proofPath: string = path.join(__dirname, '../build/proof.json')
    const snarkjsCmd: string =
        'node ' + path.join(__dirname, '../node_modules/snarkjs/build/cli.cjs')

    if (!circuit) {
        circuit = await compileAndLoadCircuit(circuitFileName)
    }

    fs.writeFileSync(inputsJsonPath, JSON.stringify(stringifyBigInts(inputs)))

    // snarkjs wc [.wasm] [input.json] [witness.wtns]
    execSync(
        `${snarkjsCmd} wc ${circuitWasmPath} ${inputsJsonPath} ${wtnsPath}`
    )

    // snrakjs wej [witness.wtns] [witness.json]
    execSync(`${snarkjsCmd} wej ${wtnsPath} ${witnessJsonPath}`)

    // snarkjs g16p [.zkey] [witness.wtns] [proof.json] [public.json]
    execSync(
        `${snarkjsCmd} g16p ${zkeyPath} ${wtnsPath} ${proofPath} ${publicJsonPath} `
    )

    const witness = unstringifyBigInts(
        JSON.parse(fs.readFileSync(witnessJsonPath).toString())
    )
    const publicSignals = unstringifyBigInts(
        JSON.parse(fs.readFileSync(publicJsonPath).toString())
    )
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
        circuit,
    }
}

const snarkVerify = async (
    proof: any,
    publicSignals: any
): Promise<boolean> => {
    const vk = JSON.parse(
        fs
            .readFileSync(
                path.join(
                    __dirname,
                    '../../circuits/build/circuits/verification_key.json'
                )
            )
            .toString()
    )
    return await snarkjs.groth16.verify(vk, publicSignals, proof)
}

export {
    SnarkBigInt,
    Deposit,
    CircuitInput,
    generateVote,
    compileAndLoadCircuit,
    executeCircuit,
    genProofAndPublicSignals,
    snarkVerify,
    stringifyBigInts,
    unstringifyBigInts,
    genBatchUstProofAndPublicSignals,
    genQvtProofAndPublicSignals,
    getSignalByName,
    verifyBatchUstProof,
    verifyQvtProof,
}
