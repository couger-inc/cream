// heavily inspired by https://github.com/tornadocash/tornado-core/blob/master/contracts/MerkleTreeWithHistory.sol
pragma solidity >=0.4.21 <0.6.0;

library Hasher {
    function MiMCSponge(uint256 in_xL, uint256 in_xR, uint256 in_k) public pure returns (uint256 xL, uint256 xR);
}

contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // precompiled prime
    uint256 public constant ZERO_VALUE =
        20589518831471408362483339583433814299656922583801556759532011432828244838126; // keccak256("cream") % FIELD_SIZE

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
        uint256 R = uint256(_left);
        uint256 C = 0;
        (R, C) = Hasher.MiMCSponge(R, C, 0);
        R = addmod(R, uint256(_right), FIELD_SIZE);
        (R, C) = Hasher.MiMCSponge(R, C, 0);
        return bytes32(R);
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