pragma circom 2.0.0;

include "merkleTree.circom";
include "hasher.circom";

// Verifies that commitment that corresponds to given secret and nullifier is included in the merkle tree of deposits
template Vote(levels) {
    signal input root;
    signal input nullifierHash;
    signal input nullifier;
    signal input secret;
    signal input path_elements[levels];
    signal input path_index[levels];

    component hasher = Hasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;
    hasher.nullifierHash === nullifierHash;

    component tree = MerkleTree(levels);
    tree.leaf <== hasher.commitment;

    for (var i = 0; i < levels; i++) {
        tree.path_elements[i] <== path_elements[i];
        tree.path_index[i] <== path_index[i];
    }

    tree.root === root;
}