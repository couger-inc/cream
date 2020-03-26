module.exports = {
  networks: {
    development: {
      network_id: '*',
      gas: 6000000,
      host: 'localhost',
      port: 8545
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