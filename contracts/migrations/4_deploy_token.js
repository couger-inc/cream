const SighUpToken = artifacts.require('SignUpToken')

module.exports = (deployer) => {
  deployer.deploy(SighUpToken)
}
