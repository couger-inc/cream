pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/pedersen.circom";

// computes Pedersen(nullifier + secret)
template Hasher() {
    signal input nullifier;
    signal input secret;
    signal output commitment;
    signal output nullifierHash;

    var len=248;

    component commitmentHasher = Pedersen(len*2);
    component nullifierHasher = Pedersen(len);
    component nullifierBits = Num2Bits(len);
    component secretBits = Num2Bits(len);

    nullifierBits.in <== nullifier;
    secretBits.in <== secret;

    for (var i = 0; i < len; i++) {
        nullifierHasher.in[i] <== nullifierBits.out[i];
        commitmentHasher.in[i] <== nullifierBits.out[i];
        commitmentHasher.in[i + len] <== secretBits.out[i];
    }

    commitment <== commitmentHasher.out[0];
    nullifierHash <== nullifierHasher.out[0];
}