module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas: 15000000
    },
    dockerGanache: {
      host: '172.17.0.2',
      port: 8545,
      network_id: '*',
      gas: 15000000,
    },
  },
  compilers: {
    solc: {
      version: "0.6.12",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
      }
    }
  },
  mocha: {
    reporter: "eth-gas-reporter"
  }
}
