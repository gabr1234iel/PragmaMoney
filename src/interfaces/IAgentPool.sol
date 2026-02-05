// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentPool {
    function dailyCap() external view returns (uint256);
    function setDailyCap(uint256 newCap) external;
}
