// SPDX-License-Identifier: GPL-3.0
/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VotingToken is ERC721, Ownable {
    // keep track of total tokens
    uint256 public curTokenId = 1;
    constructor() public ERC721("VotingToken", "VotingToken") Ownable() {}

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
