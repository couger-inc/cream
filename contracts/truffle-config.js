module.exports = {
  networks: {
    development: {
      network_id: '*',
      gas: 6000000,
      host: 'localhost',
      port: 8545
    }
  },
  mocha: {
    reporter: 'eth-gas-reporter',
		reporterOptions: {
			onlyCalledMethods: false
		}
  },
  compilers: {
    solc: {
       optimizer: {
         enabled: true,
         runs: 200
       },
    }
  }
}