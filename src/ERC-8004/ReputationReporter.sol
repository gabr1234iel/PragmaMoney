// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Auth, Authority} from "../components/Authorities/Auth.sol";

interface IReputationRegistry {
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
}

/// @title ReputationReporter
/// @notice Auth-gated proxy for submitting feedback to the ReputationRegistry.
contract ReputationReporter is Auth {
    event ReputationRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event ValidatorUpdated(address indexed validator, bool enabled);
    event FeedbackForwarded(
        address indexed validator,
        uint256 indexed agentId,
        int128 value,
        uint8 valueDecimals,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    address public reputationRegistry;
    mapping(address => bool) public isValidator;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner, Authority authority, address reputationRegistry_) external initializer {
        __Auth_init(owner, authority);
        _setReputationRegistry(reputationRegistry_);
    }

    function setReputationRegistry(address newRegistry) external requiresAuth {
        _setReputationRegistry(newRegistry);
    }

    function setValidator(address validator, bool enabled) external requiresAuth {
        require(validator != address(0), "bad validator");
        isValidator[validator] = enabled;
        emit ValidatorUpdated(validator, enabled);
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender], "not validator");
        _;
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external onlyValidator {
        IReputationRegistry(reputationRegistry).giveFeedback(
            agentId,
            value,
            valueDecimals,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
        emit FeedbackForwarded(
            msg.sender,
            agentId,
            value,
            valueDecimals,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    function _setReputationRegistry(address newRegistry) internal {
        require(newRegistry != address(0), "bad registry");
        address old = reputationRegistry;
        reputationRegistry = newRegistry;
        emit ReputationRegistryUpdated(old, newRegistry);
    }
}
