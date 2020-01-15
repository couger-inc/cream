const fs = require('fs')
const FS = require('fs-extra')
const path = require('path')
const {promisify} = require('util')
const Cream = artifacts.require('Cream')
const Verifier = artifacts.require('Verifier')
const hasherContract = artifacts.require('Hasher')

module.exports = (deployer) => {
  deployer
  .then(async () => {
    const verifier = await Verifier.deployed()
    const hasherInstance = await hasherContract.deployed()
    const config = require('config')
    await Cream.link(hasherContract, hasherInstance.address)
    await deployer.deploy(Cream, verifier.address, config.DENOMINATION, config.MERKLE_TREE_HEIGHT, config.RECIPIENTS)
  })
  .then(async () => {
    const basePath = path.resolve(__dirname, '../app/constants')
    FS.mkdirsSync(basePath)
    await promisify(fs.writeFile)(path.join(basePath, 'CreamABI.json'), JSON.stringify(Cream.abi, null, ' '))
    await promisify(fs.writeFile)(path.join(basePath, 'CreamNetworks.json'), JSON.stringify(Cream.networks, null, ' '))
  })
}