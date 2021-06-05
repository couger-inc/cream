// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.1;

import "./CreamFactory.sol";

contract FactoryRegister {
	mapping(address => string) public registry;
    event FactoryCreated(address indexed factoryAddress, string indexed orgName, address sender);

    MACIFactory public maciFactory;

	constructor(
        MACIFactory _maciFactory
    ) public {
        maciFactory = _maciFactory;
    }

    function createCreamFactory(
        string memory _orgName
    ) public {
        CreamFactory creamFactory = new CreamFactory(maciFactory);
        address addr = address(creamFactory);
        registry[addr] = _orgName;
        emit FactoryCreated(addr, _orgName, msg.sender);
    }
}
