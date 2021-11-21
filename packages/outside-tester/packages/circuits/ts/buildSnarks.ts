import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { generateVerifier } from './generateVerifier'

const currentPath = path.join(__dirname, '..')

if (!process.env.hasOwnProperty('NODE_ENV')) {
  process.env.NODE_ENV = 'test'
}

const main = () => {
  const voteCircuit = path.join(currentPath, './build/circuits/vote.r1cs')
  const voteCircuitWasm = path.join(currentPath, './build/circuits/vote.wasm')
  // TEMP ptau file
  const ptauPath = path.join(currentPath, './build/pot19_final.ptau')
  const zkey = path.join(currentPath, './build/vote.zkey')
  const vkOut = path.join(currentPath, './build/circuits/verification_key.json')
  const creamVerifier = path.join(
    currentPath,
    '../tester/contracts/verifiers/CreamVerifier.sol'
  )

  // 0: TEMP using this local centralised created ptau file
  // Should be replaced by ptau file created by MPC seremony in the future
  if (!fs.existsSync(ptauPath)) {
    console.log(`${ptauPath} not found. Downloading...`)
    const PTAU_URL =
      'https://www.dropbox.com/s/ibc9504n107dlg1/pot19_final.ptau?dl=1'

    execSync(`wget -nc -q -O ${ptauPath} ${PTAU_URL}`)
  }

  // 0: TEMP using this local centralised created ptau file
  // Should be replaced by ptau file created by MPC seremony in the future
  if (!fs.existsSync(ptauPath)) {
    console.log(`${ptauPath} not found. Downloading...`)
    const PTAU_URL =
      'https://www.dropbox.com/s/ibc9504n107dlg1/pot19_final.ptau?dl=1'

    execSync(`wget -nc -q -O ${ptauPath} ${PTAU_URL}`)
  }

  // 1: circuit compile and output file: ex`vote.json`
  // do not overwrite vote.json if it's exists
  if (fs.existsSync(voteCircuit) && fs.existsSync(voteCircuitWasm)) {
    console.log(`${voteCircuit} file exists. Skipping...`)
  } else {
    const circuitPath = path.join(
      currentPath,
      `./circom/${process.env.NODE_ENV}/vote3.circom`
    )
    execSync(
      `npx circom ${circuitPath} -r ${voteCircuit} -w ${voteCircuitWasm} -v`
    )
    console.log(`Compiled circuit: \n${voteCircuit} and ${voteCircuitWasm}`)
  }

  // 2: create zkey from r1cs and ptau file
  if (fs.existsSync(zkey)) {
    console.log(`${zkey} filie exists. Skipping...`)
  } else {
    execSync(`npx snarkjs zkn ${voteCircuit} ${ptauPath} ${zkey}`)
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
  // CREAM use local verifier generation method due to the solc compiler version
  const verifier = generateVerifier(
    JSON.parse(fs.readFileSync(vkOut).toString())
  )

  fs.writeFileSync(creamVerifier, verifier)

  console.log(`Generated verifier contract: \n ${creamVerifier}`)
}

if (require.main === module) {
  let exitCode
  try {
    exitCode = main()
  } catch (err) {
    console.error(err)
    exitCode = 1
  }
  process.exit(exitCode)
}
