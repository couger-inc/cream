import {
    FactoryRegisterContract,
    MACIFactoryContract,
    MACIFactoryInstance,
    MiMCInstance,
} from '../types/truffle-contracts'

const FactoryRegister: FactoryRegisterContract = artifacts.require(
    'FactoryRegister'
)
const MACIFactory: MACIFactoryContract = artifacts.require('MACIFactory')
const MiMC: any = artifacts.require('MiMC')

module.exports = (deployer: any) => {
    deployer.then(async () => {
        const maciFactory: MACIFactoryInstance = await MACIFactory.deployed()
        const mimc: MiMCInstance = await MiMC.deployed()
        await FactoryRegister.link(MiMC, mimc.address)
        await deployer.deploy(FactoryRegister, maciFactory.address)
    })
}
