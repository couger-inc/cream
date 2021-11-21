# Outside tester
Covers message processing, tallying and end-to-end tests part of CREAM tests.

## Why does Outside tester exist?
The tests covered by Outside tester require Circom 2 version of MACI circuits due to the fact that the number of constraints exceeds the WASM limit and only C++ witness generator can handle it. As of January 2022, Circom 2 version of MACI circuits is only available in MACI v1 branch. In addition, the branch currently requires fixes and manual integration to use.

## MACI v1 cointained
This directory cointains a snapshot of MACI (https://github.com/appliedzkp/maci) v1 branch taken some time in January 2022.

## Running tests
1. Install circom 2 following [circom documentation](https://docs.circom.io/getting-started/installation/)

1. Install dependencies and build tester
   ```
   $ npx lerna bootstrap && npx lerna run build
   ```

1. Build test-site
   ```
   $ npm run build:test-site
   ```

1. Start IPFS docker container
   ```
   $ npm run start:ipfs
   ```

1. Start tests
   ```
   $ npm run test
   ```

## Cleaning up
```
$ npx lerna clean -y && npx lerna run clean
```
