const fs = require('fs')
const FS = require('fs-extra')
const path = require('path')
const {promisify} = require('util')
const Cream = artifacts.require('Cream')
const Verifier = artifacts.require('Verifier')
const SignUpToken = artifacts.require('SignUpToken')
const hasherContract = artifacts.require('MiMC')

module.exports = (deployer) => {
  deployer
  .then(async () => {
    const verifier = await Verifier.deployed()
    const signUpToken = await SignUpToken.deployed()
    const hasherInstance = await hasherContract.deployed()
    const {config} = require('cream-config')
    await Cream.link(hasherContract, hasherInstance.address)
    await deployer.deploy(Cream, verifier.address, signUpToken.address, config.cream.denomination.toString(), config.cream.merkleTrees.toString(), config.cream.recipients)
  })
 .then(async () => {
   const basePath = path.resolve(__dirname, '../app/constants')
   FS.mkdirsSync(basePath)
   await promisify(fs.writeFile)(path.join(basePath, 'CreamABI.json'), JSON.stringify(Cream.abi, null, ' '))
   await promisify(fs.writeFile)(path.join(basePath, 'CreamNetworks.json'), JSON.stringify(Cream.networks, null, ' '))
 })
}
