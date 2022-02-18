// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.2;
pragma experimental ABIEncoderV2;

import "./Cream.sol";
import "./MACIFactory.sol";
import { SignUpTokenGatekeeper } from "./gatekeepers/SignUpTokenGatekeeper.sol";
import { ConstantInitialVoiceCreditProxy } from "./initialVoiceCreditProxy/ConstantInitialVoiceCreditProxy.sol";
import "maci-contracts/contracts/DomainObjs.sol";
import "maci-contracts/contracts/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/contracts/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

contract CreamFactory is Ownable, DomainObjs {
    mapping(address => string) public electionDetails;
    event CreamCreated(address indexed creamAddress, string ipfsHash);

    MACIFactory public maciFactory;
    uint256 public signUpDuration;
    uint256 public votingDuration;

    constructor(
        MACIFactory _maciFactory,
        uint256 _signUpDuration,
        uint256 _votingDuration
    ) {
        maciFactory = _maciFactory;
        signUpDuration = _signUpDuration;
        votingDuration = _votingDuration;
    }

    function setMaciParameters(
        uint8 _intStateTreeDepth,
        uint8 _messageTreeSubDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint256 _signUpDuration,
        uint256 _votingDuration
    ) external onlyOwner {
        maciFactory.setMaciParameters(
            _intStateTreeDepth,
            _messageTreeSubDepth,
            _messageTreeDepth,
            _voteOptionTreeDepth,
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
            _coordinator,
            signUpDuration,
            votingDuration
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
