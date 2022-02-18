pragma circom 2.0.0;

include "../vote.circom";

component main {public [root, nullifierHash]} = Vote(16);