import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const isFileExists = (filepath: string): boolean => {
    const currentPath = path.join(__dirname, '..')
    const inputFilePath = path.join(currentPath, filepath)
    const isExists = fs.existsSync(inputFilePath)
    return isExists
}

const main = () => {
    // 1: circuit compile and output file: ex`vote.json`
    // do not overwrite vote.json if it's exists
    if (isFileExists('./build/circuits/vote.json')) {
        console.log('vote.json file exists. Skipping...')
    } else {
        const circuit = execSync(
            'npx circom ./circom/vote.circom -o ./build/circuits/vote.json'
        )
        console.log(`Compiled circuit: \n${circuit.toString()}`)
    }

    // 2: create trusted setup with groth16, two output files: ex`proving_key.json verification_key.json`
    execSync('npx snarkjs setup --protocol groth -c ./build/circuits/vote.json --pk ./build/circuits/proving_key.json --vk ./build/circuits/verification_key.json')
    console.log('Created proving_key.json and verification_key.json.')

    // 3: build public key bin file from json: `proving_key.bin`
    execSync('node ./node_modules/websnark/tools/buildpkey.js -i ./build/circuits/proving_key.json -o ./build/circuits/proving_key.bin')
    console.log('Created proving_key.bin.')

    // 4: generate verifier contract: `Verifier.sol`
    execSync('npx snarkjs generateverifier -v ../contracts/contracts/Verifier.sol --vk ./build/circuits/verification_key.json')
    console.log("Created Verifier.sol contract.")
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
