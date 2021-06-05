const truffleAssert = require('truffle-assertions')

const FactoryRegister = artifacts.require('FactoryRegister')

contract('FactoryRegister', (accounts) => {
    let factoryRegister

    before(async () => {
        factoryRegister = await FactoryRegister.deployed()
    })

    describe('basic test', () => {
        it('should be able to create new factory', async () => {
            const tx = await factoryRegister.createCreamFactory('Test')
            truffleAssert.eventEmitted(tx, 'FactoryCreated')
        })
    })
})
