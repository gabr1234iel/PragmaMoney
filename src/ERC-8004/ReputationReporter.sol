// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Errors} from "../errors/Errors.sol";
import {IReputationRegistry} from "../interfaces/IReputationRegistry.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title ReputationReporter
/// @notice Auth-gated proxy for submitting feedback to the ReputationRegistry.
contract ReputationReporter is OwnableUpgradeable {
    event ReputationRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event ReporterUpdated(address indexed reporter, bool enabled);
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
    IIdentityRegistry public identityRegistry;
    mapping(address => bool) public isReporter;
    address public admin;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner, address admin_, address reputationRegistry_, address identityRegistry_) external initializer {
        __Ownable_init(owner);
        if (admin_ == address(0)) revert Errors.BadOwner();
        admin = admin_;
        _setReputationRegistry(reputationRegistry_);
        _setIdentityRegistry(identityRegistry_);
    }

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    function setAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert Errors.BadOwner();
        admin = newAdmin;
    }

    function setReputationRegistry(address newRegistry) external onlyOwnerOrAdmin {
        _setReputationRegistry(newRegistry);
    }

    function setIdentityRegistry(address newRegistry) external onlyOwnerOrAdmin {
        _setIdentityRegistry(newRegistry);
    }

    function setReporter(address reporter, bool enabled) external onlyOwnerOrAdmin {
        if (reporter == address(0)) revert Errors.BadValidator();
        isReporter[reporter] = enabled;
        emit ReporterUpdated(reporter, enabled);
    }

    modifier onlyReporter() {
        if (!isReporter[msg.sender]) revert Errors.NotValidator();
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
    ) external onlyReporter {
        address wallet = identityRegistry.getAgentWallet(agentId);
        address owner = identityRegistry.ownerOf(agentId);
        if (msg.sender == wallet || msg.sender == owner) revert Errors.SelfFeedbackNotAllowed();
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
        if (newRegistry == address(0)) revert Errors.BadRegistry();
        address old = reputationRegistry;
        reputationRegistry = newRegistry;
        emit ReputationRegistryUpdated(old, newRegistry);
    }

    function _setIdentityRegistry(address newRegistry) internal {
        if (newRegistry == address(0)) revert Errors.BadIdentity();
        identityRegistry = IIdentityRegistry(newRegistry);
    }
}
