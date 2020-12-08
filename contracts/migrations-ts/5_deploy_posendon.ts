import {
    PoseidonT3Contract,
    PoseidonT6Contract,
} from '../types/truffle-contracts'

const PoseidonT3: any = artifacts.require('PoseidonT3')
const PoseidonT6: any = artifacts.require('PoseidonT6')

module.exports = (deployer) => {
    deployer.deploy(PoseidonT3)
    deployer.deploy(PoseidonT6)
}
