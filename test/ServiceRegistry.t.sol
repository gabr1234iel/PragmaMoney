// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ServiceRegistry} from "../src/x402/ServiceRegistry.sol";
import {IServiceRegistry} from "../src/x402/interfaces/IServiceRegistry.sol";

contract ServiceRegistryTest is Test {
    ServiceRegistry public registry;

    address public registryOwner = makeAddr("registryOwner");
    address public serviceOwner = makeAddr("serviceOwner");
    address public gateway = makeAddr("gateway");
    address public stranger = makeAddr("stranger");

    bytes32 public constant SERVICE_ID = keccak256("test-service-1");
    uint256 public constant PRICE_PER_CALL = 1000; // 0.001 USDC (6 decimals)
    string public constant ENDPOINT = "https://api.example.com/v1";

    function setUp() public {
        registry = new ServiceRegistry(registryOwner);

        vm.prank(registryOwner);
        registry.setGateway(gateway);
    }

    // ==================== registerService ====================

    function test_RegisterService_Success() public {
        vm.prank(serviceOwner);

        vm.expectEmit(true, true, false, true);
        emit IServiceRegistry.ServiceRegistered(
            SERVICE_ID,
            serviceOwner,
            PRICE_PER_CALL,
            IServiceRegistry.ServiceType.API
        );

        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        IServiceRegistry.Service memory service = registry.getService(SERVICE_ID);
        assertEq(service.owner, serviceOwner);
        assertEq(service.pricePerCall, PRICE_PER_CALL);
        assertEq(service.endpoint, ENDPOINT);
        assertEq(uint256(service.serviceType), uint256(IServiceRegistry.ServiceType.API));
        assertTrue(service.active);
        assertEq(service.totalCalls, 0);
        assertEq(service.totalRevenue, 0);
    }

    function test_RegisterService_AllTypes() public {
        bytes32[5] memory ids = [
            keccak256("compute"),
            keccak256("storage"),
            keccak256("api"),
            keccak256("agent"),
            keccak256("other")
        ];
        IServiceRegistry.ServiceType[5] memory types = [
            IServiceRegistry.ServiceType.COMPUTE,
            IServiceRegistry.ServiceType.STORAGE,
            IServiceRegistry.ServiceType.API,
            IServiceRegistry.ServiceType.AGENT,
            IServiceRegistry.ServiceType.OTHER
        ];

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(serviceOwner);
            registry.registerService(ids[i], PRICE_PER_CALL, ENDPOINT, types[i]);

            IServiceRegistry.Service memory svc = registry.getService(ids[i]);
            assertEq(uint256(svc.serviceType), uint256(types[i]));
        }
    }

    function test_RegisterService_RevertAlreadyRegistered() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(serviceOwner);
        vm.expectRevert(
            abi.encodeWithSelector(ServiceRegistry.ServiceAlreadyRegistered.selector, SERVICE_ID)
        );
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );
    }

    function test_RegisterService_RevertZeroPrice() public {
        vm.prank(serviceOwner);
        vm.expectRevert(ServiceRegistry.ZeroPricePerCall.selector);
        registry.registerService(
            SERVICE_ID,
            0,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );
    }

    function test_RegisterService_RevertEmptyEndpoint() public {
        vm.prank(serviceOwner);
        vm.expectRevert(ServiceRegistry.EmptyEndpoint.selector);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            "",
            IServiceRegistry.ServiceType.API
        );
    }

    // ==================== getService ====================

    function test_GetService_RevertNotFound() public {
        bytes32 unknownId = keccak256("nonexistent");
        vm.expectRevert(
            abi.encodeWithSelector(ServiceRegistry.ServiceNotFound.selector, unknownId)
        );
        registry.getService(unknownId);
    }

    // ==================== updateServicePrice ====================

    function test_UpdateServicePrice_Success() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        uint256 newPrice = 5000;

        vm.prank(serviceOwner);
        vm.expectEmit(true, false, false, true);
        emit IServiceRegistry.ServicePriceUpdated(SERVICE_ID, PRICE_PER_CALL, newPrice);

        registry.updateServicePrice(SERVICE_ID, newPrice);

        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertEq(svc.pricePerCall, newPrice);
    }

    function test_UpdateServicePrice_RevertNotOwner() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                ServiceRegistry.NotServiceOwner.selector, SERVICE_ID, stranger
            )
        );
        registry.updateServicePrice(SERVICE_ID, 5000);
    }

    function test_UpdateServicePrice_RevertZeroPrice() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(serviceOwner);
        vm.expectRevert(ServiceRegistry.ZeroPricePerCall.selector);
        registry.updateServicePrice(SERVICE_ID, 0);
    }

    // ==================== deactivateService ====================

    function test_DeactivateService_Success() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(serviceOwner);
        vm.expectEmit(true, false, false, false);
        emit IServiceRegistry.ServiceDeactivated(SERVICE_ID);

        registry.deactivateService(SERVICE_ID);

        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertFalse(svc.active);
    }

    function test_DeactivateService_RevertNotOwner() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                ServiceRegistry.NotServiceOwner.selector, SERVICE_ID, stranger
            )
        );
        registry.deactivateService(SERVICE_ID);
    }

    // ==================== recordUsage ====================

    function test_RecordUsage_Success() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        uint256 calls = 10;
        uint256 revenue = PRICE_PER_CALL * calls;

        vm.prank(gateway);
        vm.expectEmit(true, false, false, true);
        emit IServiceRegistry.ServiceUsageRecorded(SERVICE_ID, calls, revenue);

        registry.recordUsage(SERVICE_ID, calls, revenue);

        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertEq(svc.totalCalls, calls);
        assertEq(svc.totalRevenue, revenue);
    }

    function test_RecordUsage_Cumulative() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(gateway);
        registry.recordUsage(SERVICE_ID, 5, 5000);

        vm.prank(gateway);
        registry.recordUsage(SERVICE_ID, 3, 3000);

        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertEq(svc.totalCalls, 8);
        assertEq(svc.totalRevenue, 8000);
    }

    function test_RecordUsage_RevertNotGateway() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(ServiceRegistry.NotAuthorizedGateway.selector, stranger)
        );
        registry.recordUsage(SERVICE_ID, 1, 1000);
    }

    function test_RecordUsage_RevertServiceNotFound() public {
        bytes32 unknownId = keccak256("nonexistent");
        vm.prank(gateway);
        vm.expectRevert(
            abi.encodeWithSelector(ServiceRegistry.ServiceNotFound.selector, unknownId)
        );
        registry.recordUsage(unknownId, 1, 1000);
    }

    // ==================== Enumeration ====================

    function test_Enumeration_ServiceCount() public {
        assertEq(registry.getServiceCount(), 0);

        vm.startPrank(serviceOwner);

        registry.registerService(
            keccak256("svc-1"),
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );
        assertEq(registry.getServiceCount(), 1);

        registry.registerService(
            keccak256("svc-2"),
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.COMPUTE
        );
        assertEq(registry.getServiceCount(), 2);

        registry.registerService(
            keccak256("svc-3"),
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.AGENT
        );
        assertEq(registry.getServiceCount(), 3);

        vm.stopPrank();
    }

    function test_Enumeration_ServiceIdAt() public {
        bytes32 id1 = keccak256("svc-1");
        bytes32 id2 = keccak256("svc-2");

        vm.startPrank(serviceOwner);
        registry.registerService(id1, PRICE_PER_CALL, ENDPOINT, IServiceRegistry.ServiceType.API);
        registry.registerService(id2, PRICE_PER_CALL, ENDPOINT, IServiceRegistry.ServiceType.STORAGE);
        vm.stopPrank();

        assertEq(registry.getServiceIdAt(0), id1);
        assertEq(registry.getServiceIdAt(1), id2);
    }

    function test_Enumeration_ServiceIdAt_RevertOutOfBounds() public {
        vm.expectRevert(); // array out-of-bounds panic
        registry.getServiceIdAt(0);
    }

    // ==================== setGateway ====================

    function test_SetGateway_Success() public {
        address newGateway = makeAddr("newGateway");

        vm.prank(registryOwner);
        registry.setGateway(newGateway);

        assertEq(registry.authorizedGateway(), newGateway);
    }

    function test_SetGateway_RevertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(); // Ownable: caller is not the owner
        registry.setGateway(stranger);
    }
}
