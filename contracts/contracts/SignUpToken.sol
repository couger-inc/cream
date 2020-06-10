/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/
pragma solidity >=0.4.21 <0.7.0;

import "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721Mintable.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract SignUpToken is ERC721Full, ERC721Mintable, Ownable {
    // keep track of total tokens
    uint256 curTokenId = 1;
    constructor() ERC721Full("SignUpToken", "SignUpToken") Ownable() public {}

    // give erc721 token to an address
    function giveToken(address to) public onlyOwner {
        _mint(to, curTokenId);
        curTokenId += 1;
    }

    // how many tokens are allocated
    function getCurrentSupply() public view returns (uint256) {
	    return curTokenId;
    }
}
