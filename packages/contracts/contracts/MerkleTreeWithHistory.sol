// SPDX-License-Identifier: GPL-3.0
// heavily inspired by https://github.com/tornadocash/tornado-core/blob/master/contracts/MerkleTreeWithHistory.sol
pragma solidity ^0.6.12;

library Poseidon {
  function poseidon(uint256[2] memory inputs) public pure returns (uint256 output) {}
}

contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // precompiled prime
    uint256 public constant ZERO_VALUE = uint256(keccak256(abi.encodePacked("cream"))) % FIELD_SIZE;

    uint32 public levels;

    bytes32[] public filledSubtrees;
    bytes32[] public zeros;
    uint32 public currentRootIndex = 0;
    uint32 public nextIndex = 0;
    uint32 public constant ROOT_HISTORY_SIZE = 100;
    bytes32[ROOT_HISTORY_SIZE] public roots;

    constructor(uint32 _treeLevels) public {
        require(_treeLevels > 0, "must be greater than 0");
        require(_treeLevels < 32, "must be less than 32");
        levels = _treeLevels;
        bytes32 currentZero = bytes32(ZERO_VALUE);
        zeros.push(currentZero);
        filledSubtrees.push(currentZero);

        for(uint32 i = 1; i < levels; i++) {
            currentZero = hashLeftRight(currentZero, currentZero);
            zeros.push(currentZero);
            filledSubtrees.push(currentZero);
        }

        roots[0] = hashLeftRight(currentZero, currentZero);
    }

    function hashLeftRight(bytes32 _left, bytes32 _right) public pure returns(bytes32) {
        require(uint256(_left) < FIELD_SIZE, "_left should be inside the field");
        require(uint256(_right) < FIELD_SIZE, "_right should be inside the field");
        uint256[2] memory inputs = [uint256(_left), uint256(_right)];
        uint256 output = Poseidon.poseidon(inputs);
        return bytes32(output);
    }

    function _insert(bytes32 _leaf) internal returns(uint32 index) {
        uint32 currentIndex = nextIndex;
        require(currentIndex != uint32(2)**levels, "Merkle tree is full");
        nextIndex += 1;
        bytes32 currentLevelHash = _leaf;
        bytes32 left;
        bytes32 right;
        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }
        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        roots[currentRootIndex] = currentLevelHash;
        return nextIndex - 1;
    }

    function isKnownRoot(bytes32 _root) public view returns(bool) {
        if(_root == 0) {
            return false;
        }
        uint32 i = currentRootIndex;
        do {
            if (_root == roots[i]) {
                return true;
            }
            if (i == 0) {
                i = ROOT_HISTORY_SIZE;
            }
            i--;
        } while (i != currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns(bytes32) {
        return roots[currentRootIndex];
    }
}
