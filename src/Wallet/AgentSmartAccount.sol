// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {BaseAccount} from "account-abstraction/core/BaseAccount.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {SpendingPolicyLib} from "./SpendingPolicyLib.sol";
import {SIG_VALIDATION_SUCCESS, SIG_VALIDATION_FAILED} from "account-abstraction/core/Helpers.sol";

/// @title AgentSmartAccount
/// @notice ERC-4337 smart account with spending policy enforcement for AI agents
/// @dev Designed to be deployed via minimal clones (ERC-1167) through AgentAccountFactory.
///      The owner controls the policy; the operator signs UserOps on behalf of the agent.
///      All transactions are validated against the spending policy before execution.
contract AgentSmartAccount is BaseAccount, Initializable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SpendingPolicyLib for mapping(address => bool);

    // -- Constants --

    /// @notice Canonical ERC-4337 v0.7 EntryPoint on Base Sepolia
    IEntryPoint private constant ENTRY_POINT =
        IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

    /// @notice ERC-20 transfer function selector for calldata decoding
    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    /// @notice ERC-20 approve function selector for calldata decoding
    bytes4 private constant APPROVE_SELECTOR = bytes4(keccak256("approve(address,uint256)"));

    /// @notice ERC-20 transferFrom function selector for calldata decoding
    bytes4 private constant TRANSFER_FROM_SELECTOR = bytes4(keccak256("transferFrom(address,address,uint256)"));

    // -- State --

    /// @notice Owner address that controls policy updates
    address public owner;

    /// @notice Operator address that signs UserOperations
    address public operator;

    /// @notice Factory that deployed this account (set on initialize)
    address public factory;

    /// @notice Flag indicating this account was initialized via a factory
    bool public isFactoryAccount;

    /// @notice Unique identifier for this agent
    bytes32 public agentId;

    /// @notice Spending policy configuration
    SpendingPolicyLib.Policy public policy;

    /// @notice Rolling daily spend tracker
    SpendingPolicyLib.DailySpend public dailySpend;

    /// @notice Mapping of allowed target contract addresses
    mapping(address => bool) public allowedTargets;

    /// @notice Mapping of allowed ERC-20 token addresses
    mapping(address => bool) public allowedTokens;

    // -- Events --

    event PolicyUpdated(uint256 dailyLimit, uint256 expiresAt, uint256 requiresApprovalAbove);
    event TargetAllowedUpdated(address indexed target, bool allowed);
    event TokenAllowedUpdated(address indexed token, bool allowed);
    event Executed(address indexed dest, uint256 value, bytes func);
    event BatchExecuted(uint256 count);
    event AccountInitialized(address indexed owner, address indexed operator, bytes32 agentId);

    // -- Custom errors --

    error OnlyOwner();
    error OnlyEntryPoint();
    error ExecutionFailed(address dest);
    error BatchLengthMismatch();
    error AlreadyInitialized();
    error SliceOutOfBounds();

    // -- Modifiers --

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != address(ENTRY_POINT)) {
            revert OnlyEntryPoint();
        }
        _;
    }

    // -- Constructor --

    /// @dev Disable initializers on the implementation contract
    constructor() {
        _disableInitializers();
    }

    // -- Initializer --

    /// @notice Initialize the smart account after clone deployment
    /// @param owner_ The owner address (controls policy)
    /// @param operator_ The operator address (signs UserOps)
    /// @param agentId_ Unique identifier for the agent
    /// @param dailyLimit_ Maximum daily spending in token base units
    /// @param expiresAt_ Unix timestamp when the account expires
    function initialize(
        address owner_,
        address operator_,
        bytes32 agentId_,
        uint256 dailyLimit_,
        uint256 expiresAt_
    ) external initializer {
        owner = owner_;
        operator = operator_;
        agentId = agentId_;
        factory = msg.sender;
        isFactoryAccount = true;

        policy = SpendingPolicyLib.Policy({
            dailyLimit: dailyLimit_,
            expiresAt: expiresAt_,
            requiresApprovalAbove: 0
        });

        dailySpend = SpendingPolicyLib.DailySpend({
            amount: 0,
            lastReset: block.timestamp
        });

        emit AccountInitialized(owner_, operator_, agentId_);
        emit PolicyUpdated(dailyLimit_, expiresAt_, 0);
    }

    // -- BaseAccount overrides --

    /// @notice Returns the canonical ERC-4337 v0.7 EntryPoint
    function entryPoint() public pure override returns (IEntryPoint) {
        return ENTRY_POINT;
    }

    /// @notice Validate a UserOperation signature and enforce spending policy
    /// @dev Called by the EntryPoint during validation phase
    /// @param userOp The packed user operation
    /// @param userOpHash The hash of the user operation
    /// @return validationData 0 for success (SIG_VALIDATION_SUCCESS), 1 for failure
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal override returns (uint256 validationData) {
        // 1. Verify the signature is from the operator
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(userOp.signature);

        if (recovered != operator) {
            return SIG_VALIDATION_FAILED;
        }

        // 2. Decode the calldata to determine the target and value
        bytes calldata callData = userOp.callData;

        // Must have at least a function selector
        if (callData.length < 4) {
            return SIG_VALIDATION_FAILED;
        }

        bytes4 selector = bytes4(callData[:4]);

        // Handle execute(address,uint256,bytes)
        if (selector == this.execute.selector) {
            if (callData.length < 68) {
                return SIG_VALIDATION_FAILED;
            }

            (address dest, uint256 value, bytes memory func) =
                abi.decode(callData[4:], (address, uint256, bytes));

            // 3. Validate target
            if (!allowedTargets[dest]) {
                return SIG_VALIDATION_FAILED;
            }

            // 4. If calling an ERC-20 token, validate it
            uint256 spendAmount = value;
            if (func.length >= 4) {
                bytes4 innerSelector;
                assembly {
                    innerSelector := mload(add(func, 32))
                }

                if (
                    innerSelector == TRANSFER_SELECTOR ||
                    innerSelector == APPROVE_SELECTOR
                ) {
                    // Token is the dest address
                    if (!allowedTokens[dest]) {
                        return SIG_VALIDATION_FAILED;
                    }

                    // Decode amount from the inner call (second param for transfer/approve)
                    if (func.length >= 68) {
                        (, uint256 tokenAmount) = abi.decode(_sliceBytes(func, 4), (address, uint256));
                        spendAmount += tokenAmount;
                    }
                } else if (innerSelector == TRANSFER_FROM_SELECTOR) {
                    if (!allowedTokens[dest]) {
                        return SIG_VALIDATION_FAILED;
                    }

                    if (func.length >= 100) {
                        (,, uint256 tokenAmount) = abi.decode(
                            _sliceBytes(func, 4), (address, address, uint256)
                        );
                        spendAmount += tokenAmount;
                    }
                }
            }

            // 5. Validate expiry
            if (block.timestamp > policy.expiresAt) {
                return SIG_VALIDATION_FAILED;
            }

            // 6. Validate daily limit
            uint256 currentSpend = dailySpend.amount;
            if (block.timestamp >= dailySpend.lastReset + SpendingPolicyLib.DAY) {
                currentSpend = 0;
            }
            uint256 remaining = policy.dailyLimit > currentSpend
                ? policy.dailyLimit - currentSpend
                : 0;
            if (spendAmount > remaining) {
                return SIG_VALIDATION_FAILED;
            }

            // 7. Check approval threshold
            if (policy.requiresApprovalAbove > 0 && spendAmount > policy.requiresApprovalAbove) {
                return SIG_VALIDATION_FAILED;
            }

            // 8. Record spend
            SpendingPolicyLib.recordSpend(dailySpend, spendAmount);

            return SIG_VALIDATION_SUCCESS;
        }

        // Handle executeBatch - validate each target in the batch
        if (selector == this.executeBatch.selector) {
            (address[] memory dests, uint256[] memory values, bytes[] memory funcs) =
                abi.decode(callData[4:], (address[], uint256[], bytes[]));

            if (dests.length != values.length || dests.length != funcs.length) {
                return SIG_VALIDATION_FAILED;
            }

            // Validate expiry once
            if (block.timestamp > policy.expiresAt) {
                return SIG_VALIDATION_FAILED;
            }

            uint256 totalSpend;
            for (uint256 i; i < dests.length;) {
                if (!allowedTargets[dests[i]]) {
                    return SIG_VALIDATION_FAILED;
                }

                totalSpend += values[i];

                if (funcs[i].length >= 4) {
                    bytes4 innerSel;
                    bytes memory f = funcs[i];
                    assembly {
                        innerSel := mload(add(f, 32))
                    }

                    if (
                        innerSel == TRANSFER_SELECTOR ||
                        innerSel == APPROVE_SELECTOR
                    ) {
                        if (!allowedTokens[dests[i]]) {
                            return SIG_VALIDATION_FAILED;
                        }
                        if (f.length >= 68) {
                            (, uint256 amt) = abi.decode(_sliceBytes(f, 4), (address, uint256));
                            totalSpend += amt;
                        }
                    }
                }

                unchecked { ++i; }
            }

            // Validate daily limit for total batch spend
            uint256 currentSpend = dailySpend.amount;
            if (block.timestamp >= dailySpend.lastReset + SpendingPolicyLib.DAY) {
                currentSpend = 0;
            }
            uint256 remaining = policy.dailyLimit > currentSpend
                ? policy.dailyLimit - currentSpend
                : 0;
            if (totalSpend > remaining) {
                return SIG_VALIDATION_FAILED;
            }

            if (policy.requiresApprovalAbove > 0 && totalSpend > policy.requiresApprovalAbove) {
                return SIG_VALIDATION_FAILED;
            }

            SpendingPolicyLib.recordSpend(dailySpend, totalSpend);

            return SIG_VALIDATION_SUCCESS;
        }

        // Unknown function selector
        return SIG_VALIDATION_FAILED;
    }

    // -- Execution functions --

    /// @notice Execute a single call via the EntryPoint
    /// @param dest Target address
    /// @param value ETH value to send
    /// @param func Calldata for the call
    function execute(address dest, uint256 value, bytes calldata func) external onlyEntryPoint {
        (bool success,) = dest.call{value: value}(func);
        if (!success) {
            revert ExecutionFailed(dest);
        }
        emit Executed(dest, value, func);
    }

    /// @notice Execute multiple calls in batch via the EntryPoint
    /// @param dest Array of target addresses
    /// @param values Array of ETH values
    /// @param func Array of calldata
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata values,
        bytes[] calldata func
    ) external onlyEntryPoint {
        if (dest.length != values.length || dest.length != func.length) {
            revert BatchLengthMismatch();
        }

        for (uint256 i; i < dest.length;) {
            (bool success,) = dest[i].call{value: values[i]}(func[i]);
            if (!success) {
                revert ExecutionFailed(dest[i]);
            }
            unchecked { ++i; }
        }

        emit BatchExecuted(dest.length);
    }

    // -- Policy management (owner only) --

    /// @notice Update the spending policy
    /// @param dailyLimit_ New daily spending limit
    /// @param expiresAt_ New expiration timestamp
    /// @param requiresApprovalAbove_ Threshold for requiring manual approval
    function updatePolicy(
        uint256 dailyLimit_,
        uint256 expiresAt_,
        uint256 requiresApprovalAbove_
    ) external onlyOwner {
        policy.dailyLimit = dailyLimit_;
        policy.expiresAt = expiresAt_;
        policy.requiresApprovalAbove = requiresApprovalAbove_;
        emit PolicyUpdated(dailyLimit_, expiresAt_, requiresApprovalAbove_);
    }

    /// @notice Set whether a target address is allowed
    /// @param target The target address
    /// @param allowed Whether to allow or disallow it
    function setTargetAllowed(address target, bool allowed) external onlyOwner {
        allowedTargets[target] = allowed;
        emit TargetAllowedUpdated(target, allowed);
    }

    /// @notice Set whether a token address is allowed
    /// @param token The token address
    /// @param allowed Whether to allow or disallow it
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowedUpdated(token, allowed);
    }

    // -- View functions --

    /// @notice Get the current spending policy
    function getPolicy() external view returns (SpendingPolicyLib.Policy memory) {
        return policy;
    }

    /// @notice Get the current daily spend info
    function getDailySpend() external view returns (SpendingPolicyLib.DailySpend memory) {
        return dailySpend;
    }

    /// @notice Check if a target is allowed
    function isTargetAllowed(address target) external view returns (bool) {
        return allowedTargets[target];
    }

    /// @notice Check if a token is allowed
    function isTokenAllowed(address token) external view returns (bool) {
        return allowedTokens[token];
    }

    // -- EIP-1271 --

    /// @notice Validate a signature on behalf of this smart account (EIP-1271)
    /// @dev Returns the magic value if the recovered signer matches the operator.
    ///      Used by external contracts (e.g. IdentityRegistry) to verify wallet binding signatures.
    /// @param hash The hash that was signed
    /// @param signature The ECDSA signature bytes
    /// @return magicValue `0x1626ba7e` if valid, `0xffffffff` otherwise
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue) {
        address recovered = ECDSA.recover(hash, signature);
        if (recovered == operator) {
            return bytes4(0x1626ba7e);
        }
        return bytes4(0xffffffff);
    }

    // -- Internal helpers --

    /// @dev Slice bytes from an offset (used to strip function selector from inner calldata)
    function _sliceBytes(bytes memory data, uint256 start) internal pure returns (bytes memory) {
        if (data.length < start) {
            revert SliceOutOfBounds();
        }
        uint256 len = data.length - start;
        bytes memory result = new bytes(len);
        for (uint256 i; i < len;) {
            result[i] = data[i + start];
            unchecked { ++i; }
        }
        return result;
    }

    /// @notice Allow the account to receive ETH
    receive() external payable {}
}
