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
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
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
        IEntryPoint(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789);

    /// @notice ERC-20 transfer function selector for calldata decoding
    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    /// @notice ERC-20 approve function selector for calldata decoding
    bytes4 private constant APPROVE_SELECTOR = bytes4(keccak256("approve(address,uint256)"));

    /// @notice ERC-20 transferFrom function selector for calldata decoding
    bytes4 private constant TRANSFER_FROM_SELECTOR = bytes4(keccak256("transferFrom(address,address,uint256)"));

    // -- State --

    /// @notice Owner address that controls policy updates
    address public owner;

    /// @notice Admin address that controls the allowlist root
    address public admin;

    /// @notice Operator address that signs UserOperations
    address public operator;

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

    /// @notice Merkle root of allowed actions (target + selector)
    bytes32 public actionsRoot;

    /// @notice Execution schemas per target: validates inner calldata beyond selector checks
    /// @dev Maps target address → execution-schema address.  When set, the schema is
    ///      static-called with the same calldata to extract and validate token/recipient addresses.
    mapping(address => address) public executionSchemas;

    // -- Events --

    event PolicyUpdated(uint256 dailyLimit, uint256 expiresAt, uint256 requiresApprovalAbove);
    event TargetAllowedUpdated(address indexed target, bool allowed);
    event TokenAllowedUpdated(address indexed token, bool allowed);
    event Executed(address indexed dest, uint256 value, bytes func);
    event BatchExecuted(uint256 count);
    event AccountInitialized(address indexed owner, address indexed operator, bytes32 agentId);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event ActionsRootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event ExecutionSchemaUpdated(address indexed target, address indexed schema);

    // -- Custom errors --

    error OnlyOwner();
    error OnlyAdmin();
    error ZeroAddress();
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

    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert OnlyAdmin();
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
    /// @param admin_ The admin address (controls allowlist root)
    /// @param operator_ The operator address (signs UserOps)
    /// @param agentId_ Unique identifier for the agent
    /// @param dailyLimit_ Maximum daily spending in token base units
    /// @param expiresAt_ Unix timestamp when the account expires
    /// @param actionsRoot_ Merkle root of allowed actions (target + selector)
    function initialize(
        address owner_,
        address admin_,
        address operator_,
        bytes32 agentId_,
        uint256 dailyLimit_,
        uint256 expiresAt_,
        bytes32 actionsRoot_
    ) external initializer {
        if (owner_ == address(0) || admin_ == address(0) || operator_ == address(0)) {
            revert ZeroAddress();
        }
        owner = owner_;
        admin = admin_;
        operator = operator_;
        agentId = agentId_;

        policy = SpendingPolicyLib.Policy({
            dailyLimit: dailyLimit_,
            expiresAt: expiresAt_,
            requiresApprovalAbove: 0
        });

        dailySpend = SpendingPolicyLib.DailySpend({
            amount: 0,
            lastReset: block.timestamp
        });

        actionsRoot = actionsRoot_;

        emit AccountInitialized(owner_, operator_, agentId_);
        emit AdminUpdated(address(0), admin_);
        emit PolicyUpdated(dailyLimit_, expiresAt_, 0);
        emit ActionsRootUpdated(bytes32(0), actionsRoot_);
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
        // 1. Decode signature (operator sig + optional merkle proof[s])
        bytes memory operatorSig;
        bytes32[] memory proof;
        bytes32[][] memory batchProofs;

        if (userOp.callData.length >= 4 && bytes4(userOp.callData[:4]) == this.executeBatch.selector) {
            (operatorSig, batchProofs) = abi.decode(userOp.signature, (bytes, bytes32[][]));
        } else {
            (operatorSig, proof) = abi.decode(userOp.signature, (bytes, bytes32[]));
        }

        // 2. Verify the signature is from the operator
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(operatorSig);

        if (recovered != operator) {
            return SIG_VALIDATION_FAILED;
        }

        // 3. Decode the calldata to determine the target and value
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

            // 4. Validate target
            if (!allowedTargets[dest]) {
                return SIG_VALIDATION_FAILED;
            }

            // 5. Enforce action allowlist (Merkle root of schema+target+selector+args)
            {
                address schema = executionSchemas[dest];
                if (actionsRoot != bytes32(0)) {
                    if (schema == address(0) || func.length < 4) {
                        return SIG_VALIDATION_FAILED;
                    }

                    bytes4 innerSelector;
                    assembly {
                        innerSelector := mload(add(func, 32))
                    }

                    (bool schemaOk, bytes memory rawResult) = schema.staticcall(func);
                    if (!schemaOk) {
                        return SIG_VALIDATION_FAILED;
                    }
                    // ABI-decode the return value: schema returns (bytes memory)
                    bytes memory extracted = abi.decode(rawResult, (bytes));
                    if (!_validateExtractedAddresses(extracted)) {
                        return SIG_VALIDATION_FAILED;
                    }

                    bytes32 leaf = keccak256(
                        abi.encodePacked(schema, dest, value != 0, innerSelector, extracted)
                    );
                    if (!MerkleProof.verify(proof, actionsRoot, leaf)) {
                        return SIG_VALIDATION_FAILED;
                    }
                } else if (schema != address(0) && func.length >= 4) {
                    (bool schemaOk, bytes memory rawResult) = schema.staticcall(func);
                    if (!schemaOk) {
                        return SIG_VALIDATION_FAILED;
                    }
                    bytes memory extracted = abi.decode(rawResult, (bytes));
                    if (!_validateExtractedAddresses(extracted)) {
                        return SIG_VALIDATION_FAILED;
                    }
                }
            }

            // 6. If calling an ERC-20 token, validate it
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

            // 7. Validate expiry
            if (block.timestamp > policy.expiresAt) {
                return SIG_VALIDATION_FAILED;
            }

            // 8. Validate daily limit
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

            // 9. Check approval threshold
            if (policy.requiresApprovalAbove > 0 && spendAmount > policy.requiresApprovalAbove) {
                return SIG_VALIDATION_FAILED;
            }

            // 10. Record spend
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

                // Enforce action allowlist (Merkle root of schema+target+selector+args)
                {
                    address schema = executionSchemas[dests[i]];
                    bytes memory f = funcs[i];
                    if (actionsRoot != bytes32(0)) {
                        if (schema == address(0) || f.length < 4) {
                            return SIG_VALIDATION_FAILED;
                        }
                        bytes4 innerSel;
                        assembly {
                            innerSel := mload(add(f, 32))
                        }
                        (bool schemaOk, bytes memory rawResult) = schema.staticcall(f);
                        if (!schemaOk) {
                            return SIG_VALIDATION_FAILED;
                        }
                        bytes memory extracted = abi.decode(rawResult, (bytes));
                        if (!_validateExtractedAddresses(extracted)) {
                            return SIG_VALIDATION_FAILED;
                        }
                        bytes32 leaf = keccak256(
                            abi.encodePacked(schema, dests[i], values[i] != 0, innerSel, extracted)
                        );
                        if (i >= batchProofs.length || !MerkleProof.verify(batchProofs[i], actionsRoot, leaf)) {
                            return SIG_VALIDATION_FAILED;
                        }
                    } else if (schema != address(0) && f.length >= 4) {
                        (bool schemaOk, bytes memory rawResult) = schema.staticcall(f);
                        if (!schemaOk) {
                            return SIG_VALIDATION_FAILED;
                        }
                        bytes memory extracted = abi.decode(rawResult, (bytes));
                        if (!_validateExtractedAddresses(extracted)) {
                            return SIG_VALIDATION_FAILED;
                        }
                    }
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

    /// @notice Set the merkle root for allowed actions
    /// @param newRoot New merkle root
    function setActionsRoot(bytes32 newRoot) external onlyAdmin {
        bytes32 old = actionsRoot;
        actionsRoot = newRoot;
        emit ActionsRootUpdated(old, newRoot);
    }

    /// @notice Set (or remove) an execution schema for a target address
    /// @dev When set, UserOps targeting `target` will have their inner calldata
    ///      validated by the schema via staticcall (Polystream pattern).
    /// @param target The target contract address (e.g. UniversalRouter)
    /// @param schema The execution schema address (address(0) to remove)
    function setExecutionSchema(address target, address schema) external onlyOwner {
        executionSchemas[target] = schema;
        emit ExecutionSchemaUpdated(target, schema);
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

    /// @notice Get the current actions root
    function getActionsRoot() external view returns (bytes32) {
        return actionsRoot;
    }

    /// @notice Get the execution schema for a target address
    /// @param target The target contract address
    /// @return The execution schema address (address(0) if none)
    function getExecutionSchema(address target) external view returns (address) {
        return executionSchemas[target];
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

    /// @dev Validate that every 20-byte packed address in `packed` is safe.
    ///      An address is considered safe if it is:
    ///        - address(0) — native ETH in Uniswap V4
    ///        - address(this) — the agent wallet itself (valid recipient)
    ///        - present in `allowedTokens`
    /// @param packed Tightly-packed 20-byte addresses returned by an execution schema
    /// @return True if every address is safe
    function _validateExtractedAddresses(bytes memory packed) internal view returns (bool) {
        if (packed.length == 0) return true;
        if (packed.length % 20 != 0) return false;

        uint256 count = packed.length / 20;
        for (uint256 i; i < count;) {
            address addr;
            assembly {
                addr := shr(96, mload(add(packed, add(32, mul(i, 20)))))
            }
            // Allow: zero address (native ETH), this contract (self-recipient), or allowed tokens
            if (addr != address(0) && addr != address(this) && !allowedTokens[addr]) {
                return false;
            }
            unchecked { ++i; }
        }
        return true;
    }

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
