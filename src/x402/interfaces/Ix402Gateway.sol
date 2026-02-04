// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Ix402Gateway
/// @notice Interface for the PragmaMoney x402 payment gateway
interface Ix402Gateway {
    struct Payment {
        address payer;
        bytes32 serviceId;
        uint256 calls;
        uint256 amount;
        bool valid;
    }

    event ServicePaid(
        address indexed payer,
        bytes32 indexed serviceId,
        uint256 calls,
        uint256 amount,
        bytes32 indexed paymentId
    );

    /// @notice Pay for service calls via USDC
    /// @dev Caller must have approved this contract to spend sufficient USDC
    /// @param serviceId The service to pay for
    /// @param calls Number of calls to pay for
    /// @return paymentId Unique identifier for this payment
    function payForService(bytes32 serviceId, uint256 calls) external returns (bytes32 paymentId);

    /// @notice Verify a payment record
    /// @param paymentId The payment identifier to verify
    /// @return valid Whether the payment is valid
    /// @return payer The address that made the payment
    /// @return amount The amount paid in USDC
    function verifyPayment(bytes32 paymentId)
        external
        view
        returns (bool valid, address payer, uint256 amount);

    /// @notice Get full payment details
    /// @param paymentId The payment identifier
    /// @return payment The full Payment struct
    function getPayment(bytes32 paymentId) external view returns (Payment memory payment);
}
