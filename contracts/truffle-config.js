module.exports = {
  networks: {
    development: {
      network_id: '*',
      gas: 15000000,
      host: 'localhost',
      port: 8545
    }
  },
  compilers: {
    solc: {
      version: "0.6.12",
      optimizer: {
        enabled: true,
        runs: 200
      },
    }
  }
}
