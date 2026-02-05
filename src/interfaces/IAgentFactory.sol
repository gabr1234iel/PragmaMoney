// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IAgentFactory {
    function getPoolsByAgentId(uint256 agentId) external view returns (address[] memory);
}
