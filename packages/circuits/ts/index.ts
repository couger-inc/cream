import { SnarkBigInt, createDeposit, rbigInt, Deposit } from 'libcream'
import { ChildLocation } from 'cream-merkle-tree'

export type PathElement = SnarkBigInt
export type PathIndex = ChildLocation

export interface VoteCircuitInputs {
  root: SnarkBigInt
  nullifierHash: SnarkBigInt
  nullifier: SnarkBigInt
  secret: SnarkBigInt
  path_elements: PathElement[]
  path_index: PathIndex[]
}

export interface MerkleTree {
  root: SnarkBigInt,
  insert: (commitment: SnarkBigInt) => void,
  getPathUpdate: (index: number) => [PathElement[], PathIndex[]],
}

export const generateVote = (
  merkleTree: MerkleTree,
  index: number,
  length?: number
): VoteCircuitInputs => {
  // Default value of len
  const len = length ? length : 31

  // Create deposit
  const deposit: Deposit = createDeposit(rbigInt(len), rbigInt(len))

  const { commitment, nullifierHash, nullifier, secret } = deposit

  // Update merkleTree
  merkleTree.insert(commitment)
  const merkleProof = merkleTree.getPathUpdate(index)

  const circuitInputs: VoteCircuitInputs = {
    root: merkleTree.root,
    nullifierHash,
    nullifier,
    secret: secret,
    path_elements: merkleProof[0],
    path_index: merkleProof[1],
  }
  return circuitInputs
}
