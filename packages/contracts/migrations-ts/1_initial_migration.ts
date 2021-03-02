import { MigrationsContract } from '../types/truffle-contracts'
const Migrations: MigrationsContract = artifacts.require('Migrations')

module.exports = (deployer: Truffle.Deployer) => {
    deployer.deploy(Migrations)
}
