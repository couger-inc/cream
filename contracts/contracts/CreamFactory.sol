// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./Cream.sol";
// import "./MACIFactory.sol";

contract CreamFactory is Ownable {
	// TODO: storeing voting info to ipfs is durable?
	mapping(address => string) public electionDetails;
	event CreamCreated(address indexed creamAddress, string ipfsHash);

    // MACIFactory public maciFactory;
	IVerifier public creamVerifier;

    constructor(IVerifier _creamVerifier) public {
		creamVerifier = _creamVerifier;
    }
	
	function createCream(
        SignUpToken _signUpToken,
        uint256 _denomination,
        uint32 _merkleTreeHeight,
        address[] memory _recipients,
        string memory _ipfsHash
    ) public onlyOwner {
	    address newCreamAddress = address(new Cream(creamVerifier, _signUpToken, _denomination, _merkleTreeHeight, _recipients));
		electionDetails[newCreamAddress] = _ipfsHash;
		emit CreamCreated(newCreamAddress, _ipfsHash);
	}

	// TODO: add variable update method
}
