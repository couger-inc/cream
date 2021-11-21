// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.2;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "maci-contracts/contracts/MACI.sol";
import "maci-contracts/contracts/Params.sol";
import "maci-contracts/contracts/DomainObjs.sol";
import "maci-contracts/contracts/VkRegistry.sol";
import "maci-contracts/contracts/Poll.sol";
import "maci-contracts/contracts/gatekeepers/SignUpGatekeeper.sol";
import "maci-contracts/contracts/initialVoiceCreditProxy/InitialVoiceCreditProxy.sol";

contract MACIFactory is Ownable, Params, IPubKey {
    // Constants
    uint256 private constant TREE_ARITY = 5;

    // States
    uint256 public signUpDuration;
    uint256 public votingDuration;
    MaxValues public maxValues;
    TreeDepths public treeDepths;

    // Events
    event MaciDeployed(address _maci);
    event MaciParametersChanged();

    constructor(
        uint8 _intStateTreeDepth,
        uint8 _messageTreeSubDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint256 _signUpDuration,
        uint256 _votingDuration
    ) {
        _setMaciParameters(
            _intStateTreeDepth,
            _messageTreeSubDepth,
            _messageTreeDepth,
            _voteOptionTreeDepth,
            _signUpDuration,
            _votingDuration
        );
    }

    function _setMaciParameters(
        uint8 _intStateTreeDepth,
        uint8 _messageTreeSubDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint256 _signUpDuration,
        uint256 _votingDuration
    )
        internal
    {
        treeDepths = TreeDepths(
          _intStateTreeDepth,
          _messageTreeSubDepth,
          _messageTreeDepth,
          _voteOptionTreeDepth
        );
        maxValues = MaxValues(
            TREE_ARITY ** treeDepths.messageTreeDepth,   // _maxValues.maxMessages <= treeArity ** _treeDepths.messageTreeDepth
            TREE_ARITY ** treeDepths.voteOptionTreeDepth
        );
        signUpDuration = _signUpDuration;
        votingDuration = _votingDuration;
    }

    /**
      * @dev Set MACI parameters.
      */
    function setMaciParameters(
        uint8 _intStateTreeDepth,
        uint8 _messageTreeSubDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint256 _signUpDuration,
        uint256 _votingDuration
    )
        external
        onlyOwner
    {
        require(
            _voteOptionTreeDepth >= treeDepths.voteOptionTreeDepth,
            "MACIFactory: Vote option tree depth can not be decreased"
        );
        _setMaciParameters(
            _intStateTreeDepth,
            _messageTreeSubDepth,
            _messageTreeDepth,
            _voteOptionTreeDepth,
            _signUpDuration,
            _votingDuration
        );
        emit MaciParametersChanged();
    }

    /**
      * @dev Deploy new MACI instance.
      */
    function deployMaci(
        SignUpGatekeeper _signUpGatekeeper,
        InitialVoiceCreditProxy _initialVoiceCreditProxy,
        PubKey memory _coordinatorPubKey
    )
        external
        onlyOwner
        returns (MACI _maci)
    {
        PollFactory pollFactory = new PollFactory();

        MessageAqFactory messageAqFactory = new MessageAqFactory();
        messageAqFactory.transferOwnership(address(pollFactory));

        _maci = new MACI(
            pollFactory,
            _signUpGatekeeper,
            _initialVoiceCreditProxy
        );
        pollFactory.transferOwnership(address(_maci));

        VkRegistry vkRegistry = new VkRegistry();

        _maci.init(
            vkRegistry,
            messageAqFactory
        );

        _maci.deployPoll(
            votingDuration,
            maxValues,
            treeDepths,
            _coordinatorPubKey
        );
        _maci.transferOwnership(owner());

        emit MaciDeployed(address(_maci));
    }
}
