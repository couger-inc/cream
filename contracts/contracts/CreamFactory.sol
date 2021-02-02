// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./Cream.sol";
import "./MACIFactory.sol";
import "maci-contracts/sol/MACISharedObjs.sol";
import "maci-contracts/sol/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/sol/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

contract CreamFactory is Ownable, MACISharedObjs {
	// TODO: storeing voting info to ipfs is durable?
	mapping(address => string) public electionDetails;
	event CreamCreated(address indexed creamAddress, string ipfsHash);

    MACIFactory public maciFactory;
	IVerifier public creamVerifier;

    constructor(
        MACIFactory _maciFactory,
        IVerifier _creamVerifier
    ) public {
		maciFactory = _maciFactory;
		creamVerifier = _creamVerifier;
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
        VotingToken _votingToken,
        uint256 _denomination,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
        string memory _ipfsHash,
		PubKey memory _coordinatorPubKey,
		address _coordinator,
        SignUpToken _signUpToken
    ) external onlyOwner {
		require(_coordinator != address(0), "Coordinator cannot be zero address");
		require(maciFactory.owner() == address(this), "MACI factory is not owned by CreamFactory contract");

        // Deploy new Cream contract
		Cream cream = new Cream(
            creamVerifier,
            _votingToken,
            _denomination,
            _merkleTreeHeight,
            _recipients,
			_coordinator
        );

        address creamAddress = address(cream);

		// Deploy new MACI contract
		MACI _maci = maciFactory.deployMaci(
            SignUpGatekeeper(creamAddress),
            InitialVoiceCreditProxy(creamAddress),
            _coordinatorPubKey
        );

		// Link Cream and MACI
        cream.setMaci(_maci, _signUpToken);

		electionDetails[creamAddress] = _ipfsHash;
		emit CreamCreated(creamAddress, _ipfsHash);
	}

	// TODO: add variable update method
}
