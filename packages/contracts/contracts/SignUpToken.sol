// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SignUpToken is ERC721, Ownable {
  // Keeps track of total tokens
  uint256 public curTokenId = 1;

  constructor() public ERC721("SignUpToken", "SignUpToken") Ownable() { }

  // Gives an ERC721 token to an address
  function giveToken(address to) public onlyOwner {
    _mint(to, curTokenId);
    curTokenId += 1;
  }

  // How many tokens are allocated
  function getCurrentSupply() public view returns (uint256) {
    return curTokenId;
  }
}
