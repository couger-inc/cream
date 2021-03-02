// original code from:  https://raw.githubusercontent.com/tornadocash/snarkjs/master/cli.js

import * as path from 'path'
import * as fs from 'fs'

const generateVerifier = (vk: any) => {
    let template = fs.readFileSync(
        path.join(__dirname, '../ts/verifier_groth16.sol'),
        'utf-8'
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
            `vk.IC[${i}] = Pairing.G1Point(uint256(${vk.IC[
                i
            ][0].toString()}),` +
            `uint256(${vk.IC[i][1].toString()}));\n`
    }
    template = template.replace('<%vk_ic_pts%>', vi)

    return template
}

export { generateVerifier }
