// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIdentityRegistry {
    function register(string memory agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
}
