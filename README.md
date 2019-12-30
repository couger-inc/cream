# C.R.E.A.M
Confidential Reliable Ethereum Anonymous Mixer

## Requirement

* node v10.*

## Setup

Create `.env` file and edit your `MerkleTree` height and `Denomination`.

Example:
```bash
$ cp .env.sample .env

$ cat .env
MERKLE_TREE_HEIGHT=4 // <-set tree height
DENOMINATION=100000000000000000 // <- 1 ETH
```

```bash
$ npm install
$ npm run build
```

## Test

```bash
$ npm run test
```