// SPDX-License-Identifier: GPL-3.0

/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./MerkleTreeWithHistory.sol";
import "./VotingToken.sol";
import "./SignUpToken.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "maci-contracts/sol/MACI.sol";
import "maci-contracts/sol/MACISharedObjs.sol";
import "maci-contracts/sol/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/sol/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

abstract contract IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] memory _input
    ) public virtual returns (bool);
}

contract Cream is MerkleTreeWithHistory, ERC721Holder, MACISharedObjs, SignUpGatekeeper, InitialVoiceCreditProxy, ReentrancyGuard, Ownable {
    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;

    address[] public recipients;
    IVerifier public verifier;
    VotingToken public votingToken;
    MACI public maci;
    SignUpToken public signUpToken;
    address public coordinator;
    string public tallyHash;
    bool public approved;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address recipient);
    event TallyPublished(string tallyHash);
    event TallyApproved(uint256 timestamp);


    constructor(
        IVerifier _verifier,
        VotingToken _votingToken,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
        address _coordinator
    ) public MerkleTreeWithHistory(_merkleTreeHeight) {
        require(_recipients.length > 0, "Recipients number be more than one");
        verifier = _verifier;
        votingToken = _votingToken;
        recipients = _recipients;
        coordinator = _coordinator;
        approved = false;
    }

    modifier isMaciReady() {
        require(address(maci) != address(0), "MACI contract have not set yet");
        _;
    }

    modifier isBeforeVotingDeadline() {
        require(block.timestamp < maci.calcVotingDeadline(), "the voting period has passed");
        _;
    }

    /*
     * Token transfer is executed as LIFO
     */
    function _processDeposit() internal {
        require(msg.value == 0, "ETH value is suppoed to be 0 for deposit");
        uint256 _tokenId = votingToken.tokenOfOwnerByIndex(msg.sender, 0);
        votingToken.safeTransferFrom(msg.sender, address(this), _tokenId);
    }

    function _processWithdraw(
        address payable _recipientAddress
    ) internal {
        uint256 _tokenId = votingToken.tokenOfOwnerByIndex(address(this), 0);
        votingToken.safeTransferFrom(address(this), _recipientAddress, _tokenId);
    }

    function deposit(
        bytes32 _commitment
    ) external payable nonReentrant isMaciReady isBeforeVotingDeadline {
        require(block.timestamp < maci.calcSignUpDeadline(), "the sign-up period has passed");
        require(!commitments[_commitment], "Already submitted");
        require(votingToken.balanceOf(msg.sender) == 1, "Sender does not own appropreate amount of token");
        uint32 insertedIndex = _insert(_commitment);
        commitments[_commitment] = true;
        _processDeposit();
        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    function withdraw(
        uint256 _index
    ) external payable nonReentrant isMaciReady {
        require(approved, "Tally result is not approved yet");
        require(msg.sender == coordinator, "Sender is not the coordinator");
        _processWithdraw(payable(recipients[_index]));
        emit Withdrawal(recipients[_index]);
    }

    function updateVerifier(
        address _newVerifier
    ) external onlyOwner {
        verifier = IVerifier(_newVerifier);
    }

    function setMaci(
        MACI _maci,
        SignUpToken _signUpToken
    ) external onlyOwner {
        require(address(maci) == address(0), "Already linked to MACI instance");
        require(address(signUpToken) == address(0), "Already linked to SignUpToken instance");
        require(
            _maci.calcSignUpDeadline() > block.timestamp,
            "Signup deadline must be in the future"
        );
        maci = _maci;
        signUpToken = _signUpToken;
    }

    function signUpMaci(
        PubKey calldata pubKey,
        uint256[8] memory _proof,
        bytes32 _root,
        bytes32 _nullifierHash
    ) external nonReentrant {
        require(!nullifierHashes[_nullifierHash], "The nullifier Has Been Already Spent");
        require(isKnownRoot(_root), "Cannot find your merkle root");

        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c
        ) = maci.unpackProof(_proof);

        require(verifier.verifyProof(a, b, c, [uint256(_root), uint256(_nullifierHash)]), "Invalid deposit proof");

        nullifierHashes[_nullifierHash] = true;

        uint256 maciTokenId = signUpToken.getCurrentSupply();
        bytes memory signUpGateKeeperData = abi.encode(maciTokenId);
        bytes memory initialVoiceCreditProxyData = abi.encode(msg.sender);

        signUpToken.giveToken(address(this));
        maci.signUp(pubKey, signUpGateKeeperData, initialVoiceCreditProxyData);
        signUpToken.safeTransferFrom(address(this), msg.sender, maciTokenId);
    }

    function publishTallyHash(
        string calldata _tallyHash
    ) external isMaciReady {
        require(msg.sender == coordinator, "Sender is not the coordinator");
        require(bytes(_tallyHash).length != 0, "Tally hash cannot be empty string");
        tallyHash = _tallyHash;
        emit TallyPublished(_tallyHash);
    }

    function approveTally() external onlyOwner isMaciReady {
        require(!approved, "Already approved");
        require(bytes(tallyHash).length != 0, "Tally hash has not been published");
        approved = true;
        emit TallyApproved(block.timestamp);
    }

    function submitMessageBatch(
        Message[] calldata _messages,
        PubKey[] calldata _encPubKeys
    ) external isMaciReady {
        uint256 _batchSize = _messages.length;
        for (uint8 i = 0; i < _batchSize; i++) {
            maci.publishMessage(_messages[i], _encPubKeys[i]);
        }
    }

    function getRecipients() public view returns(address[] memory) {
        return recipients;
    }
}
