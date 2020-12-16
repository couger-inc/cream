// SPDX-License-Identifier: MIT
/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/
pragma solidity ^0.6.12;

import "./MerkleTreeWithHistory.sol";
import "./SignUpToken.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "maci-contracts/sol/MACI.sol";

abstract contract IVerifier {
    function verifyProof(bytes memory _proof, uint256[5] memory _input) public virtual returns(bool);
}

contract Cream is MerkleTreeWithHistory, ERC721Holder, ReentrancyGuard, Ownable {
    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;
    mapping(address => bool) Recipients;
    uint256 public denomination;
    address[] public recipients;
    IVerifier public verifier;
    SignUpToken public signUpToken;
    MACI public maci;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee);

    constructor(
        IVerifier _verifier,
	    SignUpToken _signUpToken,
        uint256 _denomination,
        uint32 _merkleTreeHeight,
        address[] memory _recipients
    ) MerkleTreeWithHistory(_merkleTreeHeight) public {
        require(_denomination > 0, "Denomination should be greater than 0");
        require(_recipients.length > 0, "Recipients number be more than one");
        verifier = _verifier;
	    signUpToken = _signUpToken;
        denomination = _denomination;
        setRecipients(_recipients);
        recipients = _recipients;
    }

	modifier isMaciReady() {
		require(address(maci) != address(0), "MACI contract have not set yet");
		_;
	}

	modifier isBeforeVotingDeadline(){
		require(block.timestamp < maci.calcVotingDeadline(), "the voting period has passed");
		_;
	}

    function _processDeposit() internal {
	    require(msg.value == 0, "ETH value is suppoed to be 0 for deposit");
        uint256 _tokenId = signUpToken.tokenOfOwnerByIndex(msg.sender, 0);
        signUpToken.safeTransferFrom(msg.sender, address(this), _tokenId);
    }


    function _processWithdraw(
        address payable _recipient
    ) internal {
        require(msg.value == 0, "ETH value is supposed to be 0 for withdrawal");
        uint256 _tokenId = signUpToken.tokenOfOwnerByIndex(address(this), 0);
        signUpToken.safeTransferFrom(address(this), _recipient, _tokenId);
    }

    function deposit(
		bytes32 _commitment
	) external payable nonReentrant isMaciReady isBeforeVotingDeadline {
		require(block.timestamp < maci.calcSignUpDeadline(), "the sign-up period has passed");
        require(!commitments[_commitment], "Already submitted");
	    require(signUpToken.balanceOf(msg.sender) == 1, "Sender does not own appropreate amount of token");
        uint32 insertedIndex = _insert(_commitment);
        commitments[_commitment] = true;
        _processDeposit();
        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    function withdraw(
        bytes calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash,
        address payable _recipient,
        address payable _relayer,
        uint256 _fee
    ) external payable nonReentrant isMaciReady isBeforeVotingDeadline {
        require(_fee <= denomination, "Fee exceeds transfer value");
        require(!nullifierHashes[_nullifierHash], "The note has been already spent");
        require(isKnownRoot(_root), "Cannot find your merkle root");
        require(verifier.verifyProof(
            _proof, [uint256(_root), uint256(_nullifierHash), uint256(_recipient), uint256(_relayer), _fee]), "Invalid withdraw proof");
        require(isRecipient(_recipient), "Recipient do not exist");
        nullifierHashes[_nullifierHash] = true;
        _processWithdraw(_recipient);
        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    function isSpent(bytes32 _nullifierHash) public view returns(bool) {
        return nullifierHashes[_nullifierHash];
    }

    function setRecipients(
        address[] memory _recipients
    ) internal onlyOwner {
        for (uint i; i < _recipients.length; i++) {
            Recipients[_recipients[i]] = true;
        }
    }

    function isRecipient(
        address _recipient
    ) internal view returns(bool) {
        return Recipients[_recipient];
    }

    function getRecipients() public view returns(address[] memory) {
        return recipients;
    }

    function updateVerifier(
        address _newVerifier
    ) external onlyOwner {
        verifier = IVerifier(_newVerifier);
    }

    function setMaci(
        MACI _maci
    ) external onlyOwner {
        require(address(maci) == address(0), "Already linked to MACI instance");
        require(
            _maci.calcSignUpDeadline() > block.timestamp,
			"Signup deadline must be in the future"
        );
        maci = _maci;
    }

	// TODO add more maci function call
}
