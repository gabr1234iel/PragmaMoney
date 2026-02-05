// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IServiceRegistry} from "./interfaces/IServiceRegistry.sol";

/// @title ServiceRegistry
/// @notice On-chain registry for services that can be paid through the x402Gateway
/// @dev Services are identified by a bytes32 serviceId. Only the service owner
///      can update price or deactivate. Only the authorized gateway can record usage.
contract ServiceRegistry is IServiceRegistry, Ownable {
    // -- State --

    /// @notice Mapping from serviceId to Service struct
    mapping(bytes32 => Service) private _services;

    /// @notice Array of all registered service IDs for enumeration
    bytes32[] private _serviceIds;

    /// @notice The authorized gateway address that can call recordUsage
    address public authorizedGateway;

    /// @notice Additional addresses authorized to call recordUsage
    mapping(address => bool) public authorizedRecorders;

    // -- Custom errors --

    error ServiceAlreadyRegistered(bytes32 serviceId);
    error ServiceNotFound(bytes32 serviceId);
    error ServiceNotActive(bytes32 serviceId);
    error NotServiceOwner(bytes32 serviceId, address caller);
    error NotAuthorizedGateway(address caller);
    error ZeroPricePerCall();
    error EmptyName();
    error EmptyEndpoint();

    // -- Events --

    event GatewayUpdated(address indexed oldGateway, address indexed newGateway);

    // -- Modifiers --

    modifier onlyServiceOwner(bytes32 serviceId) {
        if (_services[serviceId].owner != msg.sender) {
            revert NotServiceOwner(serviceId, msg.sender);
        }
        _;
    }

    modifier onlyGateway() {
        if (msg.sender != authorizedGateway && !authorizedRecorders[msg.sender]) {
            revert NotAuthorizedGateway(msg.sender);
        }
        _;
    }

    // -- Constructor --

    /// @param initialOwner The owner of the registry (can set gateway)
    constructor(address initialOwner) Ownable(initialOwner) {}

    // -- External functions --

    /// @notice Set the authorized gateway address
    /// @param gateway The address of the x402Gateway contract
    function setGateway(address gateway) external onlyOwner {
        address old = authorizedGateway;
        authorizedGateway = gateway;
        emit GatewayUpdated(old, gateway);
    }

    /// @notice Add or remove an authorized recorder address
    /// @param recorder The address to authorize/deauthorize
    /// @param enabled Whether the address should be authorized
    function setRecorder(address recorder, bool enabled) external onlyOwner {
        authorizedRecorders[recorder] = enabled;
        emit RecorderUpdated(recorder, enabled);
    }

    /// @inheritdoc IServiceRegistry
    function registerService(
        bytes32 serviceId,
        string calldata name,
        uint256 pricePerCall,
        string calldata endpoint,
        ServiceType serviceType
    ) external {
        if (_services[serviceId].owner != address(0)) {
            revert ServiceAlreadyRegistered(serviceId);
        }
        if (bytes(name).length == 0) {
            revert EmptyName();
        }
        if (pricePerCall == 0) {
            revert ZeroPricePerCall();
        }
        if (bytes(endpoint).length == 0) {
            revert EmptyEndpoint();
        }

        _services[serviceId] = Service({
            owner: msg.sender,
            name: name,
            pricePerCall: pricePerCall,
            endpoint: endpoint,
            serviceType: serviceType,
            active: true,
            totalCalls: 0,
            totalRevenue: 0
        });

        _serviceIds.push(serviceId);

        emit ServiceRegistered(serviceId, msg.sender, name, pricePerCall, serviceType);
    }

    /// @inheritdoc IServiceRegistry
    function getService(bytes32 serviceId) external view returns (Service memory service) {
        if (_services[serviceId].owner == address(0)) {
            revert ServiceNotFound(serviceId);
        }
        return _services[serviceId];
    }

    /// @inheritdoc IServiceRegistry
    function updateServicePrice(bytes32 serviceId, uint256 newPrice) external onlyServiceOwner(serviceId) {
        if (newPrice == 0) {
            revert ZeroPricePerCall();
        }

        uint256 oldPrice = _services[serviceId].pricePerCall;
        _services[serviceId].pricePerCall = newPrice;

        emit ServicePriceUpdated(serviceId, oldPrice, newPrice);
    }

    /// @inheritdoc IServiceRegistry
    function deactivateService(bytes32 serviceId) external onlyServiceOwner(serviceId) {
        _services[serviceId].active = false;
        emit ServiceDeactivated(serviceId);
    }

    /// @inheritdoc IServiceRegistry
    function recordUsage(bytes32 serviceId, uint256 calls, uint256 revenue) external onlyGateway {
        if (_services[serviceId].owner == address(0)) {
            revert ServiceNotFound(serviceId);
        }

        _services[serviceId].totalCalls += calls;
        _services[serviceId].totalRevenue += revenue;

        emit ServiceUsageRecorded(serviceId, calls, revenue);
    }

    /// @inheritdoc IServiceRegistry
    function getServiceCount() external view returns (uint256 count) {
        return _serviceIds.length;
    }

    /// @inheritdoc IServiceRegistry
    function getServiceIdAt(uint256 index) external view returns (bytes32 serviceId) {
        return _serviceIds[index];
    }
}
