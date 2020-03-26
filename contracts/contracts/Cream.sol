/*
*
* C.R.E.A.M. - Confidential Reliable Ethereum Anonymous Mixer
*
*/
pragma solidity >=0.4.21 <0.7.0;

import "./MerkleTreeWithHistory.sol";
import "../node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../node_modules/@openzeppelin/contracts/ownership/Ownable.sol";

contract IVerifier {
    function verifyProof(bytes memory _proof, uint256[5] memory _input) public returns(bool);
}

contract Cream is MerkleTreeWithHistory, ReentrancyGuard, Ownable {
    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;
    mapping(address => bool) Recipients;
    uint256 public denomination;
    address[] public recipients;
    IVerifier public verifier;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee);

    constructor(
        IVerifier _verifier,
        uint256 _denomination,
        uint32 _merkleTreeHeight,
        address[] memory _recipients
    ) MerkleTreeWithHistory(_merkleTreeHeight) public {
        require(_denomination > 0, "Denomination should be greater than 0");
        require(_recipients.length > 0, "Recipients number be more than one");
        verifier = _verifier;
        denomination = _denomination;
        setRecipients(_recipients);
        recipients = _recipients;
    }

    function _processDeposit() internal {
        require(msg.value == denomination, "Please send ETH along with transaction");
    }

    function _processWithdraw(
        address payable _recipient,
        address payable _relayer,
        uint256 _fee
    ) internal {
        require(msg.value == 0, "Message value is supposed to be zero for withdrawal");
        // consider using "transfer" instead of call.value()() ?
        (bool success, ) = _recipient.call.value(denomination - _fee)("");
        require(success, "Payment to _recipient did not go thru");
        if(_fee > 0) {
            // consider using "transfer" instead of call.value()() ?
            (success, ) = _relayer.call.value(_fee)("");
            require(success, "Payment to _relayer did not go thru");
        }
    }

    function deposit(bytes32 _commitment) external payable nonReentrant {
        require(!commitments[_commitment], "Already submitted");
        uint32 insertedIndex = _insert(_commitment);
        commitments[_commitment] = true;
        _processDeposit();
        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    function withdraw(
        bytes calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash,
        address payable _recipient,
        address payable _relayer,
        uint256 _fee
    ) external payable nonReentrant {
        require(_fee <= denomination, "Fee exceeds transfer value");
        require(!nullifierHashes[_nullifierHash], "The note has been already spent");
        require(isKnownRoot(_root), "Cannot find your merkle root");
        require(verifier.verifyProof(
            _proof, [uint256(_root), uint256(_nullifierHash), uint256(_recipient), uint256(_relayer), _fee]), "Invalid withdraw proof");
        require(isRecipient(_recipient), "Recipient do not exist");
        nullifierHashes[_nullifierHash] = true;
        _processWithdraw(_recipient, _relayer, _fee);
        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    function isSpent(bytes32 _nullifierHash) public view returns(bool) {
        return nullifierHashes[_nullifierHash];
    }

    function setRecipients(
        address[] memory _recipients
    ) internal onlyOwner {
        for (uint i; i < _recipients.length; i++) {
            Recipients[_recipients[i]] = true;
        }
    }

    function isRecipient(
        address _recipient
    ) internal view returns(bool) {
        return Recipients[_recipient];
    }

    function getRecipients() public view returns(address[] memory) {
        return recipients;
    }

    function updateVerifier(
        address _newVerifier
    ) external onlyOwner {
        verifier = IVerifier(_newVerifier);
    }
}