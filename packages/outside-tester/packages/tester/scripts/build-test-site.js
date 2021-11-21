const fs = require('fs')
const execSync = require('child_process').execSync

const circuits = Array.from(['processMessages_test', 'tallyVotes_test'])
const circuitDir = `${__dirname}/../../maci-circuits/circom/test`
const ptau = 'powersOfTau28_hez_final_20.ptau'
const ENOBUFSExecOpt = { stdio: 'ignore' }

const downloadPtau = (dir) => {
  if (!fs.existsSync(`${dir}/${ptau}`)) {
    console.log(`Downloading ${ptau}...`)
    execSync(`cd ${dir} && wget https://hermez.s3-eu-west-1.amazonaws.com/${ptau}`, ENOBUFSExecOpt)
  }
}

const generateR1csWitnessGen = (dir) => {
  circuits.forEach(x => {
    console.log(`Building r1cs and witness generator source files of "${x}"...`)
    // force using Rust-based circom instead of Javascript-based one
    execSync(`cd ${circuitDir} && PATH=$HOME/.cargo/bin:$PATH circom --r1cs --c ${x}.circom`)

    console.log(`Building witness generator of "${x}"...`)
    execSync(`${circuitDir}/${x}_cpp && make`)

    execSync(`ln -s ${circuitDir}/${x}_cpp/${x} ${dir}/${x}`)
    execSync(`ln -s ${circuitDir}/${x}_cpp/${x}.dat ${dir}/${x}.dat`)
    execSync(`ln -s ${circuitDir}/${x}.r1cs ${dir}/${x}.r1cs`)
  })
}

const generateZKeyVkey = (dir) => {
  circuits.forEach(x => {
    process.chdir(dir)
    console.log(`Generating zkey for "${x}"...`)
    execSync(`snarkjs zkn ${x}.r1cs ${ptau} ${x}.zkey`)

    console.log(`Generating vkey for "${x}"...`)
    execSync(`snarkjs zkev ${x}.zkey ${x}.vkey`)
  })
}

const build = (dir) => {
  try {
    downloadPtau(dir)
    generateR1csWitnessGen(dir)
    generateZKeyVkey(dir)
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