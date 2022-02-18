import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const instantiateTmplWithVk = (vk: any) => {
  let template = fs.readFileSync(
    path.join(__dirname, '../../ts/creamVerifier/tmpl.sol'), 'utf-8'
  )

  const vkalpha1_str =
    `uint256(${vk.vk_alpha_1[0].toString()}),uint256(` +
    `${vk.vk_alpha_1[1].toString()}` +
    `)`
  template = template.replace('<%vk_alpha1%>', vkalpha1_str)

  const vkbeta2_str =
    `[uint256(${vk.vk_beta_2[0][1].toString()}),` +
    `uint256(${vk.vk_beta_2[0][0].toString()})], ` +
    `[uint256(${vk.vk_beta_2[1][1].toString()}),` +
    `uint256(${vk.vk_beta_2[1][0].toString()})]`
  template = template.replace('<%vk_beta2%>', vkbeta2_str)

  const vkgamma2_str =
    `[uint256(${vk.vk_gamma_2[0][1].toString()}),` +
    `uint256(${vk.vk_gamma_2[0][0].toString()})], ` +
    `[uint256(${vk.vk_gamma_2[1][1].toString()}),` +
    `uint256(${vk.vk_gamma_2[1][0].toString()})]`
  template = template.replace('<%vk_gamma2%>', vkgamma2_str)

  const vkdelta2_str =
    `[uint256(${vk.vk_delta_2[0][1].toString()}),` +
    `uint256(${vk.vk_delta_2[0][0].toString()})], ` +
    `[uint256(${vk.vk_delta_2[1][1].toString()}),` +
    `uint256(${vk.vk_delta_2[1][0].toString()})]`
  template = template.replace('<%vk_delta2%>', vkdelta2_str)

  // The points

  template = template.replace(
    /<%vk_input_length%>/g,
    (vk.IC.length - 1).toString()
  )
  template = template.replace('<%vk_ic_length%>', vk.IC.length.toString())
  let vi = ''
  for (let i = 0; i < vk.IC.length; i++) {
    if (vi != '') vi = vi + '        '
    vi =
      vi +
      `vk.IC[${i}] = Pairing.G1Point(uint256(${vk.IC[i][0].toString()}),` +
      `uint256(${vk.IC[i][1].toString()}));\n`
  }
  template = template.replace('<%vk_ic_pts%>', vi)

  return template
}


const main = () => {
  const snarkjs = `${__dirname}/../../node_modules/.bin/snarkjs`
  const testDir = `${__dirname}/../../test-site`
  const ptauName = 'pot19_final.ptau'

  const contract = `vote_test`
  const voteR1cs = `${testDir}/${contract}.r1cs`
  const ptau = `${testDir}/${ptauName}`
  const zkey = `${testDir}/${contract}.zkey`
  const vkey = `${testDir}/${contract}.vkey`

  const creamVerifier = `${__dirname}/../../../contracts/contracts/verifiers/CreamVerifier.sol`

  // create zkey from r1cs and ptau file
  if (fs.existsSync(zkey)) {
    console.log(`${zkey} filie exists. Skipping...`)
  } else {
    execSync(`${snarkjs} zkn ${voteR1cs} ${ptau} ${zkey}`)
    console.log(`Generated zkey`)
  }

  // extract vkey from zkey
  execSync(`${snarkjs} zkev ${zkey} ${vkey}`)
  console.log(`Generated vkey`)

  // instantiate cream verifier w/ vkey from the template
  const creamVerifierSrc = instantiateTmplWithVk(
    JSON.parse(fs.readFileSync(vkey).toString())
  )
  fs.writeFileSync(creamVerifier, creamVerifierSrc)

  console.log(`Generated CreamVerifier contract and copied it to contracts package`)
}

main()