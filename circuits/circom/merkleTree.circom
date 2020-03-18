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

// LeafExists and CheckRoot template referenced from MACI's merkletree circuit
// https://github.com/barryWhiteHat/maci/blob/master/circuits/circom/merkletree.circom

template LeafExists(levels){
  // Ensures that a leaf exists within a merkletree with given `root`

  // levels is depth of tree
  signal input leaf;

  signal private input path_elements[levels];
  signal private input path_index[levels];

  signal input root;

  component merkletree = MerkleTree(levels);
  merkletree.leaf <== leaf;
  for (var i = 0; i < levels; i++) {
    merkletree.path_index[i] <== path_index[i];
    merkletree.path_elements[i] <== path_elements[i];
  }

  root === merkletree.root;
}

template CheckRoot(levels) {
    // Given a Merkle root and a list of leaves, check if the root is the
    // correct result of inserting all the leaves into the tree (in the given
    // order)

    // Circom has some perticularities which limit the code patterns we can
    // use.

    // You can only assign a value to a signal once.

    // A component's input signal must only be wired to another component's output
    // signal.

    // Variables are only used for loops, declaring sizes of things, and anything
    // that is not related to inputs of a circuit.

    // The total number of leaves
    var totalLeaves = 2 ** levels;

    // The number of HashLeftRight components which will be used to hash the
    // leaves
    var numLeafHashers = totalLeaves / 2;

    // The number of HashLeftRight components which will be used to hash the
    // output of the leaf hasher components
    var numIntermediateHashers = numLeafHashers - 1;

    // Inputs to the snark
    signal private input leaves[totalLeaves];

    // The output
    signal output root;

    // The total number of hashers
    var numHashers = totalLeaves - 1;
    component hashers[numHashers];

    // Instantiate all hashers
    var i;
    for (i=0; i < numHashers; i++) {
        hashers[i] = HashLeftRight(2);
    }

    // Wire the leaf values into the leaf hashers
    for (i=0; i < numLeafHashers; i++){
        hashers[i].left <== leaves[i*2];
        hashers[i].right <== leaves[i*2+1];
    }

    // Wire the outputs of the leaf hashers to the intermediate hasher inputs
    var k = 0;
    for (i=numLeafHashers; i<numLeafHashers + numIntermediateHashers; i++) {
        hashers[i].left <== hashers[k*2].hash;
        hashers[i].right <== hashers[k*2+1].hash;
        k++;
    }

    // Wire the output of the final hash to this circuit's output
    root <== hashers[numHashers-1].hash;
}