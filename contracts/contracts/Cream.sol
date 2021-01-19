// SPDX-License-Identifier: GPL-3.0

/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./MerkleTreeWithHistory.sol";
import "./SignUpToken.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "maci-contracts/sol/MACI.sol";
import "maci-contracts/sol/MACISharedObjs.sol";
import "maci-contracts/sol/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/sol/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

abstract contract IVerifier {
    function verifyProof(bytes memory _proof, uint256[2] memory _input) public virtual returns(bool);
}

contract Cream is MerkleTreeWithHistory, ERC721Holder, MACISharedObjs, SignUpGatekeeper, InitialVoiceCreditProxy, ReentrancyGuard, Ownable {
    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;
    uint256 public denomination;
    address[] public recipients;
    IVerifier public verifier;
    SignUpToken public signUpToken;
    MACI public maci;
	address public coordinator;
	string public tallyHash;
	bool public approved;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address recipient);
	event TallyPublished(string tallyHash);
	event TallyApproved(uint256 timestamp);


    constructor(
        IVerifier _verifier,
	    SignUpToken _signUpToken,
        uint256 _denomination,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
		address _coordinator
    ) MerkleTreeWithHistory(_merkleTreeHeight) public {
        require(_denomination > 0, "Denomination should be greater than 0");
        require(_recipients.length > 0, "Recipients number be more than one");
        verifier = _verifier;
	    signUpToken = _signUpToken;
        denomination = _denomination;
        recipients = _recipients;
		coordinator = _coordinator;
		approved = false;
    }

	modifier isMaciReady() {
		require(address(maci) != address(0), "MACI contract have not set yet");
		_;
	}

	modifier isBeforeVotingDeadline(){
		require(block.timestamp < maci.calcVotingDeadline(), "the voting period has passed");
		_;
	}

	/*
	 * Token transfer is executed as LIFO
	 */
    function _processDeposit() internal {
	    require(msg.value == 0, "ETH value is suppoed to be 0 for deposit");
        uint256 _tokenId = signUpToken.tokenOfOwnerByIndex(msg.sender, 0);
        signUpToken.safeTransferFrom(msg.sender, address(this), _tokenId);
    }

    function _processWithdraw(
        address payable _recipientAddress
    ) internal {
        uint256 _tokenId = signUpToken.tokenOfOwnerByIndex(address(this), 0);
        signUpToken.safeTransferFrom(address(this), _recipientAddress, _tokenId);
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
        MACI _maci
    ) external onlyOwner {
        require(address(maci) == address(0), "Already linked to MACI instance");
        require(
            _maci.calcSignUpDeadline() > block.timestamp,
			"Signup deadline must be in the future"
        );
        maci = _maci;
    }

	function signUpMaci(
		PubKey calldata pubKey,
		bytes calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash
    ) external nonReentrant {
		require(!nullifierHashes[_nullifierHash], "The nullifier Has Been Already Spent");
        require(isKnownRoot(_root), "Cannot find your merkle root");
		require(verifier.verifyProof(_proof, [uint256(_root), uint256(_nullifierHash)]), "Invalid deposit proof");
        nullifierHashes[_nullifierHash] = true;

		/* TODO: with voicecredits */
		uint256 voiceCredits = 1;

		bytes memory signUpGateKeeperData = abi.encode(msg.sender, voiceCredits);
		bytes memory initialVoiceCreditProxyData = abi.encode(msg.sender);

		maci.signUp(pubKey, signUpGateKeeperData, initialVoiceCreditProxyData);
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
}
