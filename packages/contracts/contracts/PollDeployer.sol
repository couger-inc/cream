// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.2;
pragma experimental ABIEncoderV2;

import "maci-contracts/contracts/MACI.sol";
import "maci-contracts/contracts/Params.sol";
import "maci-contracts/contracts/DomainObjs.sol";

// used for testing only
contract PollDeployer is Params, IPubKey {
    function deploy(
        MACI _maci,
        uint8 _intStateTreeDepth,
        uint8 _messageTreeSubDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint256 _votingDuration,
        uint256 _coordinatorPubkeyX,
        uint256 _coordinatorPubkeyY
    )
        external
    {
        uint256 TREE_ARITY = 5;

        PubKey memory _coordinatorPubKey = PubKey(
            _coordinatorPubkeyX,
            _coordinatorPubkeyY
        );
        TreeDepths memory _treeDepths = TreeDepths(
          _intStateTreeDepth,
          _messageTreeSubDepth,
          _messageTreeDepth,
          _voteOptionTreeDepth
        );
        MaxValues memory _maxValues = MaxValues(
            TREE_ARITY ** _treeDepths.messageTreeDepth,
            TREE_ARITY ** _treeDepths.voteOptionTreeDepth
        );
        _maci.deployPoll(
            _votingDuration,
            _maxValues,
            _treeDepths,
            _coordinatorPubKey
        );
    }
}
