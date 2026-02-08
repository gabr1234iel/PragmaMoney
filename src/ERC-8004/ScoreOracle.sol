// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../errors/Errors.sol";
import {IReputationRegistry} from "../interfaces/IReputationRegistry.sol";
import {IAgentFactory} from "../interfaces/IAgentFactory.sol";
import {IAgentPool} from "../interfaces/IAgentPool.sol";

/// @title ScoreOracle
/// @notice Computes normalized scores from reputation signals and updates daily caps on agent pools.
contract ScoreOracle is Ownable {
    event ScoreUpdated(uint256 indexed agentId, int256 score, int256 previousScore);
    event PoolCapUpdated(address indexed pool, uint256 oldCap, uint256 newCap);

    IReputationRegistry public immutable reputationRegistry;
    IAgentFactory public immutable agentFactory;
    address public immutable reputationReporter;
    address public admin;

    mapping(uint256 => int256) public lastScore;
    mapping(uint256 => mapping(bytes32 => int256)) public lastTagScore;

    struct Accumulation {
        int256 sumScore;
        uint256 weightSum;
        int256 deltaSum;
        uint256 deltaWeightSum;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        IReputationRegistry reputationRegistry_,
        IAgentFactory agentFactory_,
        address reputationReporter_,
        address owner_,
        address admin_
    ) Ownable(owner_) {
        if (address(reputationRegistry_) == address(0)) revert Errors.BadRegistry();
        if (address(agentFactory_) == address(0)) revert Errors.BadTarget();
        if (reputationReporter_ == address(0)) revert Errors.BadTarget();
        if (owner_ == address(0)) revert Errors.BadOwner();
        if (admin_ == address(0)) revert Errors.BadOwner();

        reputationRegistry = reputationRegistry_;
        agentFactory = agentFactory_;
        reputationReporter = reputationReporter_;
        admin = admin_;
    }

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    function setAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert Errors.BadOwner();
        admin = newAdmin;
    }

    /// @notice Compute a normalized score to 18 decimals.
    function normalizeScore(int128 summaryValue, uint8 summaryValueDecimals) public pure returns (int256) {
        if (summaryValueDecimals > 18) return int256(summaryValue); // defensive; should not happen
        uint256 scale = 10 ** uint256(18 - summaryValueDecimals);
        return int256(summaryValue) * int256(scale);
    }

    /// @notice Calculate score and update daily caps for all pools of an agent.
    /// @param agentId Agent token id used for scoring.
    /// @param tag1s Primary tag filters (paired with tag2s).
    /// @param tag2s Secondary tag filters (paired with tag1s).
    /// @param weightsBps Signed weights (in bps, 10_000 = 1.0x; negative means lower is better).
    function calculateScore(
        uint256 agentId,
        string[] calldata tag1s,
        string[] calldata tag2s,
        int32[] calldata weightsBps
    ) external {
        if (tag1s.length != tag2s.length) revert Errors.BadTagArrayLength();
        if (tag1s.length != weightsBps.length) revert Errors.BadTagArrayLength();

        Accumulation memory acc = _accumulate(agentId, tag1s, tag2s, weightsBps);
        if (acc.weightSum == 0) revert Errors.NoSummary();

        int256 score = acc.sumScore / int256(acc.weightSum);
        int256 prev = lastScore[agentId];
        lastScore[agentId] = score;

        // If no prior tag baselines exist, just set and return.
        if (acc.deltaWeightSum == 0) {
            emit ScoreUpdated(agentId, score, prev);
            return;
        }

        address pool = agentFactory.poolByAgentId(agentId);
        if (pool == address(0)) revert Errors.NoPools();

        // Aggregate relative delta (1e18)
        int256 overallDelta = acc.deltaSum / int256(acc.deltaWeightSum);
        if (overallDelta == 0) {
            emit ScoreUpdated(agentId, score, prev);
            return;
        }

        {
            uint256 oldCap = IAgentPool(pool).dailyCap();
            uint256 newCap = oldCap;
            uint256 absDelta = uint256(overallDelta > 0 ? overallDelta : -overallDelta);
            // Scale change proportionally to relative delta, capped at 5% (500 bps).
            uint256 bps = (absDelta * 10_000) / 1e18;
            if (bps > 500) bps = 500;
            if (bps == 0) {
                emit ScoreUpdated(agentId, score, prev);
                return;
            }

            if (overallDelta > 0) {
                newCap = oldCap + (oldCap * bps) / 10_000;
            } else {
                newCap = oldCap - (oldCap * bps) / 10_000;
            }

            if (newCap != oldCap) {
                IAgentPool(pool).setDailyCap(newCap);
                emit PoolCapUpdated(pool, oldCap, newCap);
            }
        }

        emit ScoreUpdated(agentId, score, prev);
    }

    function _accumulate(
        uint256 agentId,
        string[] calldata tag1s,
        string[] calldata tag2s,
        int32[] calldata weightsBps
    ) internal returns (Accumulation memory acc) {
        address[] memory clients = new address[](1);
        clients[0] = reputationReporter;
        for (uint256 i; i < tag1s.length; i++) {
            (uint64 count, int128 summaryValue, uint8 summaryDecimals) =
                reputationRegistry.getSummary(agentId, clients, tag1s[i], tag2s[i]);
            if (count == 0) continue;
            int256 w = int256(weightsBps[i]);
            if (w == 0) continue;
            int256 norm = normalizeScore(summaryValue, summaryDecimals);
            acc.sumScore += norm * w;
            acc.weightSum += uint256(w > 0 ? w : -w);

            bytes32 key = keccak256(abi.encodePacked(tag1s[i], "|", tag2s[i]));
            int256 prevTag = lastTagScore[agentId][key];
            lastTagScore[agentId][key] = norm;
            if (prevTag == 0) continue;

            int256 rel = ((norm - prevTag) * int256(1e18)) / prevTag;
            if (w < 0) rel = -rel;
            int256 absW = w > 0 ? w : -w;
            acc.deltaSum += rel * absW;
            acc.deltaWeightSum += uint256(absW);
        }
    }
}
