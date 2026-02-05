// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

contract Addresses {
    string public constant baseSepolia = "baseSepolia";

    error Addresses__ZeroAddress(string chainName, string valueName);
    error Addresses__ZeroBytes32(string chainName, string valueName);
    error Addresses__ValueAlreadySet(string chainName, string valueName);

    mapping(string => mapping(string => bytes32)) public values;

    constructor() {
        _addBaseSepoliaValues();
    }

    function getAddress(string memory chainName, string memory valueName) public view returns (address a) {
        a = toAddress(values[chainName][valueName]);
        if (a == address(0)) {
            revert Addresses__ZeroAddress(chainName, valueName);
        }
    }

    function getBytes32(string memory chainName, string memory valueName) public view returns (bytes32 b) {
        b = values[chainName][valueName];
        if (b == bytes32(0)) {
            revert Addresses__ZeroBytes32(chainName, valueName);
        }
    }

    function setValue(bool overrideOk, string memory chainName, string memory valueName, bytes32 value) public {
        if (!overrideOk && values[chainName][valueName] != bytes32(0)) {
            revert Addresses__ValueAlreadySet(chainName, valueName);
        }
        values[chainName][valueName] = value;
    }

    function setAddress(bool overrideOk, string memory chainName, string memory valueName, address value) public {
        setValue(overrideOk, chainName, valueName, toBytes32(value));
    }

    function _addBaseSepoliaValues() private {
        values[baseSepolia]["USDC"] = toBytes32(0x036CbD53842c5426634e7929541eC2318f3dCF7e);
        values[baseSepolia]["IdentityRegistry"] = toBytes32(0x8004A818BFB912233c491871b3d84c89A494BD9e);
        values[baseSepolia]["ReputationRegistry"] = toBytes32(0x8004B663056A597Dffe9eCcC1965A193B7388713);
    }

    function toBytes32(address a) public pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    function toAddress(bytes32 b) public pure returns (address) {
        return address(uint160(uint256(b)));
    }
}
