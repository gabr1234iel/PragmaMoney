// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ERC4626ExecutionSchema
/// @author PragmaMoney
/// @notice Validates ERC-4626 vault calldata and extracts involved addresses.
/// @dev Exposes the same selectors as ERC-4626 entrypoints so it can be
///      static-called with the vault calldata (Polystream pattern).
///      Returns packed 20-byte addresses for allowlist validation.
contract ERC4626ExecutionSchema {
    error UnsupportedSelector(bytes4 selector);
    error InvalidVault();

    address public immutable vault;
    address public immutable asset;

    constructor(address vault_) {
        if (vault_ == address(0)) revert InvalidVault();
        vault = vault_;
        asset = IERC4626Minimal(vault_).asset();
    }

    /// @notice ERC-4626 deposit(assets, receiver)
    function deposit(uint256, address receiver) external pure returns (bytes memory) {
        return abi.encodePacked(receiver);
    }

    /// @notice ERC-4626 mint(shares, receiver)
    function mint(uint256, address receiver) external pure returns (bytes memory) {
        return abi.encodePacked(receiver);
    }

    /// @notice ERC-4626 withdraw(assets, receiver, owner)
    function withdraw(uint256, address receiver, address owner) external pure returns (bytes memory) {
        return abi.encodePacked(receiver, owner);
    }

    /// @notice ERC-4626 redeem(shares, receiver, owner)
    function redeem(uint256, address receiver, address owner) external pure returns (bytes memory) {
        return abi.encodePacked(receiver, owner);
    }

    fallback() external {
        revert UnsupportedSelector(msg.sig);
    }
}

interface IERC4626Minimal {
    function asset() external view returns (address);
}
