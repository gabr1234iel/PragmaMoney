// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReputationRegistry {
    function getIdentityRegistry() external view returns (address);

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    function getLastIndex(uint256 agentId, address client) external view returns (uint64);

    function readFeedback(uint256 agentId, address client, uint64 index)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool revoked);

    function revokeFeedback(uint256 agentId, uint64 index) external;

    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view returns (uint64[] memory, int128[] memory, uint8[] memory, bool[] memory);

    function appendResponse(
        uint256 agentId,
        address client,
        uint64 index,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    function getResponseCount(
        uint256 agentId,
        address client,
        uint64 index,
        address[] calldata responders
    ) external view returns (uint64);
}
