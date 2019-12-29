const fs = require('fs')
const path = require('path')
const {promisify} = require('util')

require('dotenv').config({ path: '../.env' })
const Cream = artifacts.require('Cream')
const Verifier = artifacts.require('Verifier')
const hasherContract = artifacts.require('Hasher')

// CAUTION: For test dapps purpose
const recipients = [
  "0x65A5B0f4eD2170Abe0158865E04C4FF24827c529",
  "0x9cc9C78eDA7c7940f968eF9D8A90653C47CD2a5e",
  "0xb97796F8497bb84C63e650E9527Be587F18c09f8"
]

module.exports = (deployer) => {
  deployer
  .then(async () => {
    const { MERKLE_TREE_HEIGHT, DENOMINATION } = process.env
    const verifier = await Verifier.deployed()
    const hasherInstance = await hasherContract.deployed()
    await Cream.link(hasherContract, hasherInstance.address)
    await deployer.deploy(Cream, verifier.address, DENOMINATION, MERKLE_TREE_HEIGHT, recipients)
  })
  .then(async () => {
    const basePath = path.resolve(__dirname, '../app/constants')
    await promisify(fs.writeFile)(path.join(basePath, 'CreamABI.json'), JSON.stringify(Cream.abi, null, ' '))
    await promisify(fs.writeFile)(path.join(basePath, 'CreamNetworks.json'), JSON.stringify(Cream.networks, null, ' '))
  })
}