// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IServiceRegistry
/// @notice Interface for the PragmaMoney service registry
interface IServiceRegistry {
    enum ServiceType {
        COMPUTE,
        STORAGE,
        API,
        AGENT,
        OTHER
    }

    struct Service {
        address owner;
        uint256 pricePerCall;
        string endpoint;
        ServiceType serviceType;
        bool active;
        uint256 totalCalls;
        uint256 totalRevenue;
    }

    event ServiceRegistered(
        bytes32 indexed serviceId,
        address indexed owner,
        uint256 pricePerCall,
        ServiceType serviceType
    );

    event ServicePriceUpdated(
        bytes32 indexed serviceId,
        uint256 oldPrice,
        uint256 newPrice
    );

    event ServiceDeactivated(bytes32 indexed serviceId);

    event ServiceUsageRecorded(
        bytes32 indexed serviceId,
        uint256 calls,
        uint256 revenue
    );

    /// @notice Register a new service
    /// @param serviceId Unique identifier for the service
    /// @param pricePerCall Price in USDC (6 decimals) per API call
    /// @param endpoint The service endpoint URL
    /// @param serviceType The type of service
    function registerService(
        bytes32 serviceId,
        uint256 pricePerCall,
        string calldata endpoint,
        ServiceType serviceType
    ) external;

    /// @notice Get service details
    /// @param serviceId The service identifier
    /// @return service The full Service struct
    function getService(bytes32 serviceId) external view returns (Service memory service);

    /// @notice Update the price per call for a service
    /// @param serviceId The service identifier
    /// @param newPrice New price in USDC (6 decimals)
    function updateServicePrice(bytes32 serviceId, uint256 newPrice) external;

    /// @notice Deactivate a service
    /// @param serviceId The service identifier
    function deactivateService(bytes32 serviceId) external;

    /// @notice Record usage for a service (callable by gateway only)
    /// @param serviceId The service identifier
    /// @param calls Number of calls made
    /// @param revenue Revenue generated in USDC
    function recordUsage(bytes32 serviceId, uint256 calls, uint256 revenue) external;

    /// @notice Get the total number of registered services
    /// @return count The number of services
    function getServiceCount() external view returns (uint256 count);

    /// @notice Get a service ID by index
    /// @param index The index in the service list
    /// @return serviceId The service identifier at that index
    function getServiceIdAt(uint256 index) external view returns (bytes32 serviceId);
}
