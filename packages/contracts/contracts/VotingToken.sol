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
    mapping(address => uint256) public weights;

    constructor() public ERC721("VotingToken", "VotingToken") Ownable() {}

    // give erc721 token to an address
    function giveToken(address _to, uint256 _weight) public onlyOwner {
        require(_weight > 0 && _weight <= 100, "Error: weight range must be between 1 and 100");
        _mint(_to, curTokenId);
        weights[_to] = _weight;
        curTokenId += 1;
    }

    function getTokenWeight(address _key) external view returns (uint256) {
        require(_key != address(0), "key cannot be zero address");
        return weights[_key];
    }

    // how many tokens are allocated
    function getCurrentSupply() public view returns (uint256) {
        return curTokenId;
    }
}
