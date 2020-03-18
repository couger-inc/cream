include "merkleTree.circom";
include "hasher.circom"

// Verifies that commitment that corresponds to given secret and nullifier is included in the merkle tree of deposits
template Vote(levels) {
    signal input root;
    signal input nullifierHash;
    signal input recipient; // not taking part in any computations
    signal input relayer;  // not taking part in any computations
    signal input fee;      // not taking part in any computations
    signal private input nullifier;
    signal private input secret;
    signal private input path_elements[levels];
    signal private input path_index[levels];

    component hasher = Hasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;
    hasher.nullifierHash === nullifierHash;

    component tree = MerkleTree(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.path_elements[i] <== path_elements[i];
        tree.path_index[i] <== path_index[i];
    }
}

component main = Vote(4);
