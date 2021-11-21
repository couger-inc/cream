// SPDX-License-Identifier: GPL-3.0

/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/

pragma solidity ^0.7.2;
pragma experimental ABIEncoderV2;

import "./MerkleTreeWithHistory.sol";
import "./VotingToken.sol";
import "./SignUpToken.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "maci-contracts/contracts/MACI.sol";
import "maci-contracts/contracts/DomainObjs.sol";
import "maci-contracts/contracts/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/contracts/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

// the counterpart of this on the MACI side is SnarkVerifier
interface IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] memory _input
    ) external view returns (bool);
}

contract Cream is MerkleTreeWithHistory, ERC721Holder, DomainObjs, SignUpGatekeeper, InitialVoiceCreditProxy, ReentrancyGuard, Ownable {
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
    uint256 public votingDuration;

    // cover sign-up priod check on the cream side until MACI supports this again
    uint256 signUpDeadline;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address recipient);
    event TallyPublished(string tallyHash);
    event TallyApproved(uint256 timestamp);

    constructor(
        IVerifier _verifier,
        VotingToken _votingToken,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
        address _coordinator,
        uint256 _signUpDuration,
        uint256 _votingDuration

    ) MerkleTreeWithHistory(_merkleTreeHeight) {
        require(_recipients.length > 0, "Recipients number be more than one");
        verifier = _verifier;
        votingToken = _votingToken;
        recipients = _recipients;
        coordinator = _coordinator;
        approved = false;
        signUpDeadline = block.timestamp + _signUpDuration;
        votingDuration = _votingDuration;
    }

    modifier isMaciReady() {
        require(address(maci) != address(0), "MACI contract have not set yet");
        _;
    }

    modifier isBeforeVotingDeadline() {
        Poll poll = maci.getPoll(0);
        (uint256 deployTime, uint256 duration) = poll.getDeployTimeAndDuration();
        require(block.timestamp < deployTime + duration, "the voting period has passed");
        _;
    }

    modifier isBeforeSignUpDeadline() {
        require(block.timestamp < signUpDeadline, "the sign-up period has passed");
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
    ) external payable nonReentrant isMaciReady isBeforeSignUpDeadline {
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
            signUpDeadline > block.timestamp,
            "Signup deadline must be in the future"
        );

        maci = _maci;
        signUpToken = _signUpToken;
    }

    // copied from MACI.sol 0.7.2 since verifiers in MACI 1.0.2 dropped this
    // function and takes uint256[8] proof directly
    function unpackProof(
        uint256[8] memory _proof
    ) public pure returns (
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory
    ) {
        return (
            [_proof[0], _proof[1]],
            [
                [_proof[2], _proof[3]],
                [_proof[4], _proof[5]]
            ],
            [_proof[6], _proof[7]]
        );
    }

    function signUpMaci(
        PubKey calldata pubKey,
        uint256[8] memory _proof,
        bytes32 _root,
        bytes32 _nullifierHash
    ) external nonReentrant isBeforeSignUpDeadline {
        require(!nullifierHashes[_nullifierHash], "The nullifier Has Been Already Spent");
        require(isKnownRoot(_root), "Cannot find your merkle root");

        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c
        ) = unpackProof(_proof);

        require(verifier.verifyProof(
            a, b, c, [uint256(_root), uint256(_nullifierHash)]), "Invalid deposit proof");

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
            Poll poll = maci.getPoll(0);
            poll.publishMessage(_messages[i], _encPubKeys[i]);
        }
    }

    function getRecipients() public view returns(address[] memory) {
        return recipients;
    }
}
