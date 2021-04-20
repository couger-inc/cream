// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./Cream.sol";
import "./MACIFactory.sol";
import { SignUpTokenGatekeeper } from "./gatekeepers/SignUpTokenGatekeeper.sol";
import { ConstantInitialVoiceCreditProxy } from "./initialVoiceCreditProxy/ConstantInitialVoiceCreditProxy.sol";
import "maci-contracts/sol/MACISharedObjs.sol";
import "maci-contracts/sol/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/sol/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

contract CreamFactory is Ownable, MACISharedObjs {
	mapping(address => string) public electionDetails;
	event CreamCreated(address indexed creamAddress, string ipfsHash);

    MACIFactory public maciFactory;
	//	IVerifier public creamVerifier;

    constructor(
        MACIFactory _maciFactory
    ) public {
		maciFactory = _maciFactory;
    }

    function setMaciParameters(
        uint8 _stateTreeDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint8 _tallyBatchSize,
        uint8 _messageBatchSize,
        SnarkVerifier _batchUstVerifier,
        SnarkVerifier _qvtVerifier,
        uint256 _signUpDuration,
        uint256 _votingDuration
   ) external onlyOwner {
		maciFactory.setMaciParameters(
            _stateTreeDepth,
            _messageTreeDepth,
            _voteOptionTreeDepth,
            _tallyBatchSize,
            _messageBatchSize,
            _batchUstVerifier,
            _qvtVerifier,
            _signUpDuration,
            _votingDuration
        );
	}

	function createCream(
		IVerifier _creamVerifier,
        VotingToken _votingToken,
        SignUpToken _signUpToken,
        uint256 _balance,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
        string memory _ipfsHash,
		PubKey memory _coordinatorPubKey,
		address _coordinator
    ) external {
		require(_coordinator != address(0), "Coordinator cannot be zero address");
		require(maciFactory.owner() == address(this), "MACI factory is not owned by CreamFactory contract");

		// Deploy new SignUpTokenGatekeeper
		SignUpTokenGatekeeper sutg = new SignUpTokenGatekeeper (
			_signUpToken
		);

		// Deploy new import ConstantInitialVoiceCreditProxy
		ConstantInitialVoiceCreditProxy civcp = new ConstantInitialVoiceCreditProxy (
			_balance
		);

        // Deploy new Cream contract
		Cream cream = new Cream(
            _creamVerifier,
            _votingToken,
            _merkleTreeHeight,
            _recipients,
			_coordinator
        );

		address creamAddress = address(cream);

		// Deploy new MACI contract
		MACI _maci = maciFactory.deployMaci(
            SignUpGatekeeper(address(sutg)),
            InitialVoiceCreditProxy(address(civcp)),
            _coordinatorPubKey
        );

		// Link Cream and MACI
        cream.setMaci(_maci, _signUpToken);

        // Set cream contract owner
        cream.transferOwnership(msg.sender);

		electionDetails[creamAddress] = _ipfsHash;
		emit CreamCreated(creamAddress, _ipfsHash);
	}
}
