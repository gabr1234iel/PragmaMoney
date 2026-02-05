// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IAgentFactory {
    function getPoolsByAgentId(uint256 agentId) external view returns (address[] memory);
    function agentCount() external view returns (uint256);
    function getAgentIdAt(uint256 index) external view returns (uint256);
}
