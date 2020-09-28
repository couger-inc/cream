import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { executeCircuit } from '.'

const isFileExists = (filepath: string): boolean => {
    const currentPath = path.join(__dirname, '..')
    const inputFilePath = path.join(currentPath, filepath)
    const isExists = fs.existsSync(inputFilePath)
    return isExists
}

const main = () => {
    const voteCircuit = './build/circuits/vote.r1cs'
    const voteCircuitWasm = './build/circuits/vote.wasm'
    // TEMP ptau file
    const ptauPath = './build/pot19_final.ptau'
    const zkey = './build/vote.zkey'
    const vkOut = './build/circuits/verification_key.json'
    const solVerifier = './build/Verifier.sol'

    // 1: circuit compile and output file: ex`vote.json`
    // do not overwrite vote.json if it's exists
    if (isFileExists(voteCircuit) && isFileExists(voteCircuitWasm)) {
        console.log(`${voteCircuit} file exists. Skipping...`)
    } else {
        execSync(
            `npx circom ./circom/vote.circom -r ${voteCircuit} -w ${voteCircuitWasm} -v`
        )
        console.log(`Compiled circuit: \n${voteCircuit} and ${voteCircuitWasm}`)
    }

    // 2: create zkey from r1cs and ptau file
    if (isFileExists(zkey)) {
        console.log(`${zkey} filie exists. Skipping...`)
    } else {
        execSync(`npx snarkjs zkey new -v ${voteCircuit} ${ptauPath} ${zkey}`)
        console.log(`Generated zkey file: \n${zkey}`)
    }

    // 3: export vkey
    execSync(`npx snarkjs zkev ${zkey} ${vkOut}`)
    // snarkjs cannot specify `${vkOut}` path
    const rootPath = path.join(__dirname, '../verification_key.json')
    if (fs.existsSync(rootPath)) {
        console.log(`Moving verification_key.json file...`)
        execSync(`mv ${rootPath} ${vkOut}`)
    }

    console.log(`Generated verification_key: \n${vkOut}`)

    // 4: export solidity verifier
    execSync(`npx snarkjs zkey export solidityverifier ${zkey} ${solVerifier}`)
    console.log(`Generated verifier contract: \n ${solVerifier}`)
}

if (require.main === module) {
    let exitCode;
    try {
        exitCode = main()
    } catch (err) {
        console.error(err)
        exitCode = 1
    }
    process.exit(exitCode)
}
