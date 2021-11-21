# zkC.R.E.A.M

[![Actions Status](https://github.com/couger-inc/cream/workflows/cream%20contract%20test/badge.svg)](https://github.com/couger-inc/cream/actions)

Zero-Knowledge Confidential Reliable Ethereum Anonymous Mixer

## Requirement

* `node` >= v14.0

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
Tests that require Circom 2 are currently under outside-tester sub project. Refer to [README.md](./packages/outside-tester/README.md) of the project for execution details.

Other tests can run w/ npm or yarn e.g.

```
$ yarn test
```
