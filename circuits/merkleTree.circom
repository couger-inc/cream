include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/mimcsponge.circom";

// Computes MiMC([left, right])
template HashLeftRight(length) {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = MiMCSponge(length, 220, 1);
    hasher.ins[0] <== left;
    hasher.ins[1] <== right;
    hasher.k <== 0;
    hash <== hasher.outs[0];
}

template Selector() {
    signal input input_element;
    signal input path_element;
    signal input path_index;

    signal output left;
    signal output right;

    path_index * (1 - path_index) === 0

    component mux = MultiMux1(2)
    mux.c[0][0] <== input_element;
    mux.c[0][1] <== path_element;

    mux.c[1][0] <== path_element;
    mux.c[1][1] <== input_element;

    mux.s <== path_index;

    left <== mux.out[0];
    right <== mux.out[1];
}

// Verifies that merkle proof is correct for given merkle root and a leaf
// pathIndices input is an array of 0/1 selectors telling whether given path_elements is on the left or right side of merkle path
template MerkleTree(levels) {
    signal input leaf;
    signal input path_elements[levels];
    signal input path_index[levels];

    signal output root;

    component selectors[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        selectors[i] = Selector();
        hashers[i] = HashLeftRight(2);

        selectors[i].path_element <== path_elements[i];
        selectors[i].path_index <== path_index[i];

        hashers[i].left <== selectors[i].left;
        hashers[i].right <== selectors[i].right;
    }

    selectors[0].input_element <== leaf;

    for (var i = 1; i < levels; i++) {
        selectors[i].input_element <== hashers[i-1].hash;
    }

    root <== hashers[levels - 1].hash;
}