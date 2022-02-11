# zkC.R.E.A.M

[![Actions Status](https://github.com/couger-inc/cream/workflows/cream%20contract%20test/badge.svg)](https://github.com/couger-inc/cream/actions)

Zero-Knowledge Confidential Reliable Ethereum Anonymous Mixer

## Requirement

* `node` >= v14.0
* `circom` >= v2.0.0
* Following C++ libraries:
  - [nlohmann/json](https://github.com/nlohmann/json)
  - libgmp-dev
  - nasm

## Contained external packages
- A modified version of [MACI](https://github.com/appliedzkp/maci) v1 branch (6e2b1011198e59f61ca80404c97705b813a655c4)
- A modified version of [circom_runtime](https://github.com/iden3/circom_runtime) 0.1.17 (afce802d66a1c26c4220e529b699fda22057b8e9)

## Setup

### Config file
Adjust [packages/config/prod.ts](./packages/config/prod.ts) as needed:

Make sure that you use the same merkle tree level in [packages/config/prod.ts](./packages/config/prod.ts) and [packages/circuits/prod/vote.circom](./packages/circuits/circom/prod/vote.circom).

### Building Cream

```bash
$ npx lerna bootstrap
$ npx lerna run build
```

## Running Tests
1. Install circom 2 following [circom documentation](https://docs.circom.io/getting-started/installation/)

1. Build test-sites
   ```
   $ npx lerna run build:test-site
   ```

1. Start IPFS docker container
   ```
   $ yarn start:ipfs
   ```

1. Run tests:
   ```
   $ npx lerna run test
   ```

## Cleaning up all generated files
```
$ yarn clean
```

## TODO upon MACI 1.0.4 release
- call ./scripts/compileSol.sh in maci-contracts before running E2E tests
