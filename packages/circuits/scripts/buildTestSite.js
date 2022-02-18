const fs = require('fs')
const execSync = require('child_process').execSync

const circuits = Array.from([
  'hasher_test',
  'merkleTreeCheckRoot_test',
  'merkleTreeHashLeftRight_test',
  'merkleTreeLeafExists_test',
  'merkleTree_test',
  'vote_test',
])
const circuitDir = `${__dirname}/../circom/test`
const ptau = 'pot19_final.ptau'
const ENOBUFSExecOpt = { stdio: 'ignore' }

const downloadPtau = (dir) => {
  if (!fs.existsSync(`${dir}/${ptau}`)) {
    console.log(`Downloading ${ptau}...`)
    execSync(`cd ${dir} && wget https://www.dropbox.com/s/ibc9504n107dlg1/${ptau}`, ENOBUFSExecOpt)
  }
}

const generateWasmSymR1cs = (dir) => {
  circuits.forEach(x => {
    console.log(`Building witness generator wasm, sym and r1cs of "${x}"...`)
    // force using Rust-based circom instead of Javascript-based one
    if (!fs.existsSync(`${circuitDir}/${x}_js`)) {
      execSync(`cd ${circuitDir} && PATH=$HOME/.cargo/bin:$PATH circom --sym --wasm --r1cs ${x}.circom`)
    }

    const ifWrap = (simlink, makeSimlink) => `if [ ! -f ${simlink} ]; then ${makeSimlink}; fi`

    execSync(ifWrap(`${dir}/${x}.wasm`, `ln -s ${circuitDir}/${x}_js/${x}.wasm ${dir}/${x}.wasm`))
    execSync(ifWrap(`${dir}/${x}.sym`, `ln -s ${circuitDir}/${x}.sym ${dir}/${x}.sym`))
    execSync(ifWrap(`${dir}/${x}.r1cs`, `ln -s ${circuitDir}/${x}.r1cs ${dir}/${x}.r1cs`))
  })
}

const build = (dir) => {
  try {
    downloadPtau(dir)
    generateWasmSymR1cs(dir)
    console.log('Done.')
  } catch(err) {
    console.error(err.stdout.toString('utf-8'))
  }
}

// make sure Rust-based circom is installed
if (!fs.existsSync(`${process.env.HOME}/.cargo/bin/circom`)) {
  console.log(`Rust-based circom is required, but missing`)
  process.exit(0)
}

const testDir = `${__dirname}/../test-site`
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir)
  console.log(`Created "${testDir}" directory`)
}

build(testDir)