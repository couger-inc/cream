// SPDX-License-Identifier: MIT
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

	function createCream(
        SignUpToken _signUpToken,
        uint256 _denomination,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
        string memory _ipfsHash,
		PubKey memory _coordinatorPubKey
    ) public onlyOwner {
		// Deploy new Cream contract
		Cream cream = new Cream(
            creamVerifier,
            _signUpToken,
            _denomination,
            _merkleTreeHeight,
            _recipients
        );

        address creamAddress = address(cream);

		// Deploy new MACI contract
		MACI maci = maciFactory.deployMaci(
            SignUpGatekeeper(creamAddress),
            InitialVoiceCreditProxy(creamAddress),
            _coordinatorPubKey
        );

		// Link Cream and MACI
        cream.setMaci(maci);

		electionDetails[creamAddress] = _ipfsHash;
		emit CreamCreated(creamAddress, _ipfsHash);
	}

	// TODO: add variable update method
}
