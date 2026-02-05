// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IServiceRegistry} from "./interfaces/IServiceRegistry.sol";
import {Ix402Gateway} from "./interfaces/Ix402Gateway.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IAgentFactory} from "../interfaces/IAgentFactory.sol";

/// @title x402Gateway
/// @notice Payment gateway for the x402 protocol. Agents pay for services through this
///         contract, which transfers USDC from the payer to the service owner, records
///         the payment, and updates usage stats in the ServiceRegistry.
/// @dev The payer must approve this contract for USDC spending before calling payForService.
contract x402Gateway is Ix402Gateway {
    using SafeERC20 for IERC20;

    // -- State --

    /// @notice The ServiceRegistry contract
    IServiceRegistry public immutable serviceRegistry;

    /// @notice The USDC token contract
    IERC20 public immutable usdc;

    /// @notice Identity registry for resolving agent wallets
    IIdentityRegistry public immutable identityRegistry;

    /// @notice Agent factory for resolving agent pools
    IAgentFactory public immutable agentFactory;

    /// @notice Fixed split in basis points (40% pool / 60% agent)
    uint256 public constant POOL_BPS = 4000;
    uint256 public constant AGENT_BPS = 6000;
    uint256 public constant BPS = 10_000;

    /// @notice Monotonically increasing nonce for payment ID generation
    uint256 public nonce;

    /// @notice Mapping from paymentId to Payment record
    mapping(bytes32 => Payment) private _payments;

    // -- Custom errors --

    error ServiceNotActive(bytes32 serviceId);
    error ZeroCalls();
    error PaymentOverflow(bytes32 serviceId, uint256 pricePerCall, uint256 calls);
    error AgentWalletNotFound(uint256 agentId);
    error AgentPoolNotFound(uint256 agentId);

    // -- Constructor --

    /// @param _serviceRegistry Address of the deployed ServiceRegistry
    /// @param _usdc Address of the USDC token on this chain
    /// @param _identityRegistry Address of the IdentityRegistry
    /// @param _agentFactory Address of the AgentFactory
    constructor(address _serviceRegistry, address _usdc, address _identityRegistry, address _agentFactory) {
        serviceRegistry = IServiceRegistry(_serviceRegistry);
        usdc = IERC20(_usdc);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        agentFactory = IAgentFactory(_agentFactory);
    }

    // -- External functions --

    /// @inheritdoc Ix402Gateway
    function payForService(bytes32 serviceId, uint256 calls) external returns (bytes32 paymentId) {
        if (calls == 0) {
            revert ZeroCalls();
        }

        // Look up service
        IServiceRegistry.Service memory service = serviceRegistry.getService(serviceId);

        if (!service.active) {
            revert ServiceNotActive(serviceId);
        }

        // Calculate total cost (checked arithmetic prevents overflow)
        uint256 total = service.pricePerCall * calls;

        // Verify the multiplication did not silently wrap (defensive, Solidity 0.8 checks)
        // This explicit check is belt-and-suspenders for clarity
        if (calls != 0 && total / calls != service.pricePerCall) {
            revert PaymentOverflow(serviceId, service.pricePerCall, calls);
        }

        // Generate unique payment ID
        paymentId = keccak256(abi.encodePacked(msg.sender, serviceId, calls, nonce));
        unchecked {
            ++nonce;
        }

        // Store payment record
        _payments[paymentId] = Payment({
            payer: msg.sender,
            serviceId: serviceId,
            calls: calls,
            amount: total,
            valid: true
        });

        uint256 agentId = serviceRegistry.getAgentId(serviceId);
        address agentWallet = identityRegistry.getAgentWallet(agentId);
        if (agentWallet == address(0)) {
            revert AgentWalletNotFound(agentId);
        }

        address pool = agentFactory.poolByAgentId(agentId);
        if (pool == address(0)) {
            revert AgentPoolNotFound(agentId);
        }

        uint256 poolShare = (total * POOL_BPS) / BPS;
        uint256 agentShare = total - poolShare;

        // Transfer USDC from payer to pool + agent wallet (CEI: state written above, interaction below)
        if (poolShare > 0) {
            usdc.safeTransferFrom(msg.sender, pool, poolShare);
        }
        if (agentShare > 0) {
            usdc.safeTransferFrom(msg.sender, agentWallet, agentShare);
        }

        // Record usage in the registry
        serviceRegistry.recordUsage(serviceId, calls, total);

        emit ServicePaid(msg.sender, serviceId, calls, total, paymentId);
    }

    /// @inheritdoc Ix402Gateway
    function verifyPayment(bytes32 paymentId)
        external
        view
        returns (bool valid, address payer, uint256 amount)
    {
        Payment storage p = _payments[paymentId];
        return (p.valid, p.payer, p.amount);
    }

    /// @inheritdoc Ix402Gateway
    function getPayment(bytes32 paymentId) external view returns (Payment memory payment) {
        return _payments[paymentId];
    }
}
