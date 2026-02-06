// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title UniswapV4ExecutionSchema
/// @author PragmaMoney
/// @notice Validates Uniswap V4 UniversalRouter calldata and extracts token/recipient addresses.
/// @dev Follows the Polystream VaultExecutionSchema pattern: exposes `execute()` with the
///      same signature as UniversalRouter.  When static-called with the agent's calldata it
///      decodes the commands, permits **only** V4_SWAP, decodes the inner V4 router actions,
///      and returns ABI-packed 20-byte addresses (tokens + explicit recipients) that the
///      AgentSmartAccount must validate against its own allowlist.
///
///      Supported Uniswap V4 actions:
///        SWAP_EXACT_IN_SINGLE (0x06), SWAP_EXACT_IN (0x07),
///        SWAP_EXACT_OUT_SINGLE (0x08), SWAP_EXACT_OUT (0x09),
///        SETTLE (0x0b), SETTLE_ALL (0x0c), SETTLE_PAIR (0x0d),
///        TAKE (0x0e), TAKE_ALL (0x0f), TAKE_PAIR (0x10), TAKE_PORTION (0x11)
contract UniswapV4ExecutionSchema {
    // ==================== UniversalRouter Commands ====================

    /// @notice UniversalRouter command identifier for Uniswap V4 swaps
    uint8 internal constant V4_SWAP = 0x10;

    // ==================== V4 Router Actions ====================

    /// @notice Exact-input swap through a single V4 pool
    uint8 internal constant SWAP_EXACT_IN_SINGLE = 0x06;
    /// @notice Exact-input swap through a multi-hop path
    uint8 internal constant SWAP_EXACT_IN = 0x07;
    /// @notice Exact-output swap through a single V4 pool
    uint8 internal constant SWAP_EXACT_OUT_SINGLE = 0x08;
    /// @notice Exact-output swap through a multi-hop path
    uint8 internal constant SWAP_EXACT_OUT = 0x09;
    /// @notice Settle a specific amount of a currency to the PoolManager
    uint8 internal constant SETTLE = 0x0b;
    /// @notice Settle the full contract balance of a currency
    uint8 internal constant SETTLE_ALL = 0x0c;
    /// @notice Settle two currencies at once
    uint8 internal constant SETTLE_PAIR = 0x0d;
    /// @notice Take a specific amount of a currency to an explicit recipient
    uint8 internal constant TAKE = 0x0e;
    /// @notice Take the full balance of a currency to msgSender (implicit)
    uint8 internal constant TAKE_ALL = 0x0f;
    /// @notice Take two currencies to msgSender (implicit)
    uint8 internal constant TAKE_PAIR = 0x10;
    /// @notice Take a portion (bips) of a currency to an explicit recipient
    uint8 internal constant TAKE_PORTION = 0x11;

    // ==================== Errors ====================

    /// @notice Thrown when a non-V4_SWAP command is encountered
    /// @param command The unsupported command byte
    error UnsupportedCommand(uint8 command);
    /// @notice Thrown when an unrecognised V4 router action is encountered
    /// @param action The unsupported action byte
    error UnsupportedAction(uint8 action);
    /// @notice Thrown when the commands array is empty
    error EmptyCommands();
    /// @notice Thrown when commands and inputs arrays have different lengths
    error InputLengthMismatch();

    // ==================== Main Entry ====================

    /// @notice Decode and validate UniversalRouter.execute calldata.
    /// @dev Function signature intentionally matches UniversalRouter's
    ///      `execute(bytes,bytes[],uint256)` so that a `staticcall` with the
    ///      same calldata hits this function directly (Polystream pattern).
    ///      Only the V4_SWAP command (0x10) is permitted; any other command
    ///      causes a revert.  Inner V4 router actions are decoded and all
    ///      token/recipient addresses are extracted into a packed bytes blob
    ///      for the caller (AgentSmartAccount) to validate.
    /// @param commands Packed command bytes (each byte = one command)
    /// @param inputs   ABI-encoded inputs for each command
    /// @return addressesFound Packed 20-byte addresses (tokens + explicit recipients)
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 /* deadline */
    ) external pure returns (bytes memory addressesFound) {
        if (commands.length == 0) revert EmptyCommands();
        if (commands.length != inputs.length) revert InputLengthMismatch();

        for (uint256 i; i < commands.length; ++i) {
            uint8 command = uint8(commands[i]);
            if (command != V4_SWAP) {
                revert UnsupportedCommand(command);
            }

            // V4_SWAP input = abi.encode(bytes actions, bytes[] params)
            (bytes memory actions, bytes[] memory params) =
                abi.decode(inputs[i], (bytes, bytes[]));

            bytes memory extracted = _extractFromActions(actions, params);
            addressesFound = bytes.concat(addressesFound, extracted);
        }
    }

    // ==================== Internal ====================

    /// @dev Iterate over V4 router actions and extract all involved addresses.
    /// @param actions Packed action command bytes
    /// @param params  ABI-encoded parameters for each action
    /// @return found  Packed 20-byte addresses
    function _extractFromActions(
        bytes memory actions,
        bytes[] memory params
    ) internal pure returns (bytes memory found) {
        for (uint256 i; i < actions.length; ++i) {
            uint8 action = uint8(actions[i]);

            if (action == SWAP_EXACT_IN_SINGLE || action == SWAP_EXACT_OUT_SINGLE) {
                // Flattened struct starts with PoolKey: (currency0, currency1, ...)
                (address c0, address c1) = _decodeTwoAddresses(params[i]);
                found = bytes.concat(found, abi.encodePacked(c0, c1));

            } else if (action == SWAP_EXACT_IN || action == SWAP_EXACT_OUT) {
                // First word is currencyIn / currencyOut
                address currency = _decodeFirstAddress(params[i]);
                found = bytes.concat(found, abi.encodePacked(currency));

            } else if (action == SETTLE || action == SETTLE_ALL) {
                // (Currency currency, uint256 amount_or_max)
                address currency = _decodeFirstAddress(params[i]);
                found = bytes.concat(found, abi.encodePacked(currency));

            } else if (action == SETTLE_PAIR || action == TAKE_PAIR) {
                // (Currency currency0, Currency currency1)
                (address c0, address c1) = _decodeTwoAddresses(params[i]);
                found = bytes.concat(found, abi.encodePacked(c0, c1));

            } else if (action == TAKE) {
                // (Currency currency, address recipient, uint256 amount)
                (address currency, address recipient) = _decodeTwoAddresses(params[i]);
                found = bytes.concat(found, abi.encodePacked(currency, recipient));

            } else if (action == TAKE_ALL) {
                // (Currency currency, uint256 minAmount) — recipient is implicit msgSender
                address currency = _decodeFirstAddress(params[i]);
                found = bytes.concat(found, abi.encodePacked(currency));

            } else if (action == TAKE_PORTION) {
                // (Currency currency, address recipient, uint256 bips)
                (address currency, address recipient) = _decodeTwoAddresses(params[i]);
                found = bytes.concat(found, abi.encodePacked(currency, recipient));

            } else {
                revert UnsupportedAction(action);
            }
        }
    }

    /// @dev Read the first ABI-encoded address (word 0) from `data`.
    /// @param data ABI-encoded bytes containing at least one address slot
    /// @return addr The decoded address
    function _decodeFirstAddress(bytes memory data) internal pure returns (address addr) {
        assembly {
            addr := mload(add(data, 32))
        }
    }

    /// @dev Read the first two ABI-encoded addresses (words 0 and 1) from `data`.
    /// @param data ABI-encoded bytes containing at least two address slots
    /// @return a First address
    /// @return b Second address
    function _decodeTwoAddresses(bytes memory data) internal pure returns (address a, address b) {
        assembly {
            a := mload(add(data, 32))
            b := mload(add(data, 64))
        }
    }

    // ==================== Fallback ====================

    /// @notice Reverts for any function selector not explicitly handled.
    fallback() external {
        revert UnsupportedCommand(0);
    }
}
