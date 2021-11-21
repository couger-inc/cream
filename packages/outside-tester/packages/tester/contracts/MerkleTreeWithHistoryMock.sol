// SPDX-License-Identifier: MIT
pragma solidity ^0.7.2;

import "./MerkleTreeWithHistory.sol";

// used for testing only
contract MerkleTreeWithHistoryMock is MerkleTreeWithHistory {
    constructor(uint32 _treeLevels) MerkleTreeWithHistory(_treeLevels) {}
    // make _insert function publically accessible for testing
    function insert(bytes32 _leaf) public {
        _insert(_leaf);
    }
}