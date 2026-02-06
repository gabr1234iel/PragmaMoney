// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.t.sol";
import {ServiceRegistry} from "../src/x402/ServiceRegistry.sol";
import {IServiceRegistry} from "../src/x402/interfaces/IServiceRegistry.sol";
import {AgentFactory} from "../src/Launchpad/AgentFactory.sol";
import {AgentPool} from "../src/Launchpad/AgentPool.sol";
import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ServiceRegistryTest is BaseTest {
    ServiceRegistry public registry;
    IIdentityRegistry public identityRegistry;
    IReputationRegistry public reputationRegistry;
    ReputationReporter public reporter;
    AgentFactory public agentFactory;
    AgentPool public pool;

    address public registryOwner;
    address public serviceOwner;
    address public gateway;
    address public stranger;
    address public recorder;

    bytes32 public constant SERVICE_ID = keccak256("test-service-1");
    uint256 public constant PRICE_PER_CALL = 1000; // 0.001 USDC (6 decimals)
    string public constant SERVICE_NAME = "Test Service";
    string public constant ENDPOINT = "https://api.example.com/v1";
    uint256 public agentId;

    function setUp() public {
        _startFork();
        _setupUsdc();

        registryOwner = deployer;
        serviceOwner = agentOwner;
        gateway = address(0xBEEF);
        stranger = bob;
        recorder = address(0xCAFE);

        vm.startPrank(deployer);
        identityRegistry = _deployIdentity();
        reputationRegistry = _deployReputation(address(identityRegistry));
        reporter = _deployReporter(address(reputationRegistry), address(identityRegistry));
        agentFactory = new AgentFactory(IIdentityRegistry(address(identityRegistry)), deployer, deployer, deployer, address(reporter));
        reporter.setAdmin(address(agentFactory));
        vm.stopPrank();

        vm.prank(agentOwner);
        agentId = identityRegistry.register("file://metadata/agent-1.json");

        AgentFactory.CreateParams memory p = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-1.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool",
            symbol: "APOOL",
            poolOwner: deployer,
            dailyCap: 100e6,
            vestingDuration: 7 days,
            metadataURI: "file://metadata/agent-1.json"
        });

        vm.prank(deployer);
        address poolAddr = agentFactory.createAgentPool(agentId, agentOwner, p);
        pool = AgentPool(poolAddr);

        registry = new ServiceRegistry(registryOwner, address(identityRegistry), address(agentFactory));

        vm.prank(registryOwner);
        registry.setGateway(gateway);
    }

    // ==================== registerService ====================

    function test_RegisterService_Success() public {
        // serviceOwner == agentOwner == NFT owner == agentWallet (register() sets both)
        address agentWallet = identityRegistry.getAgentWallet(agentId);

        vm.prank(serviceOwner);

        vm.expectEmit(true, true, false, true);
        emit IServiceRegistry.ServiceRegistered(
            SERVICE_ID,
            agentId,
            agentWallet,
            SERVICE_NAME,
            PRICE_PER_CALL,
            IServiceRegistry.ServiceType.API
        );

        registry.registerService(
            SERVICE_ID,
            agentId,
            SERVICE_NAME,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        IServiceRegistry.Service memory service = registry.getService(SERVICE_ID);
        assertEq(service.owner, agentWallet);
        assertEq(service.name, SERVICE_NAME);
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
            registry.registerService(ids[i], agentId, SERVICE_NAME, PRICE_PER_CALL, ENDPOINT, types[i]);

            IServiceRegistry.Service memory svc = registry.getService(ids[i]);
            assertEq(uint256(svc.serviceType), uint256(types[i]));
        }
    }

    function test_RegisterService_RevertAlreadyRegistered() public {
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
            PRICE_PER_CALL,
            "",
            IServiceRegistry.ServiceType.API
        );
    }

    function test_RegisterService_RevertEmptyName() public {
        vm.prank(serviceOwner);
        vm.expectRevert(ServiceRegistry.EmptyName.selector);
        registry.registerService(
            SERVICE_ID,
            agentId,
            "",
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );
    }

    function test_RegisterService_RevertNotAgentOwnerOrWallet() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(ServiceRegistry.NotAgentOwnerOrWallet.selector, agentId, stranger)
        );
        registry.registerService(
            SERVICE_ID,
            agentId,
            SERVICE_NAME,
            PRICE_PER_CALL,
            ENDPOINT,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            SERVICE_NAME,
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
            agentId,
            "Service One",
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );
        assertEq(registry.getServiceCount(), 1);

        registry.registerService(
            keccak256("svc-2"),
            agentId,
            "Service Two",
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.COMPUTE
        );
        assertEq(registry.getServiceCount(), 2);

        registry.registerService(
            keccak256("svc-3"),
            agentId,
            "Service Three",
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
        registry.registerService(id1, agentId, "Service 1", PRICE_PER_CALL, ENDPOINT, IServiceRegistry.ServiceType.API);
        registry.registerService(id2, agentId, "Service 2", PRICE_PER_CALL, ENDPOINT, IServiceRegistry.ServiceType.STORAGE);
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

    // ==================== setRecorder ====================

    function test_SetRecorder_Success() public {
        vm.prank(registryOwner);
        vm.expectEmit(true, false, false, true);
        emit IServiceRegistry.RecorderUpdated(recorder, true);
        registry.setRecorder(recorder, true);

        assertTrue(registry.authorizedRecorders(recorder));
    }

    function test_SetRecorder_Disable() public {
        vm.prank(registryOwner);
        registry.setRecorder(recorder, true);
        assertTrue(registry.authorizedRecorders(recorder));

        vm.prank(registryOwner);
        registry.setRecorder(recorder, false);
        assertFalse(registry.authorizedRecorders(recorder));
    }

    function test_SetRecorder_RevertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        registry.setRecorder(recorder, true);
    }

    function test_RecordUsage_ByRecorder() public {
        // Enable recorder
        vm.prank(registryOwner);
        registry.setRecorder(recorder, true);

        // Register a service
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            agentId,
            SERVICE_NAME,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        // Recorder calls recordUsage
        vm.prank(recorder);
        vm.expectEmit(true, false, false, true);
        emit IServiceRegistry.ServiceUsageRecorded(SERVICE_ID, 1, 1000);
        registry.recordUsage(SERVICE_ID, 1, 1000);

        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertEq(svc.totalCalls, 1);
        assertEq(svc.totalRevenue, 1000);
    }

    function test_RecordUsage_GatewayStillWorks() public {
        // Enable a recorder
        vm.prank(registryOwner);
        registry.setRecorder(recorder, true);

        // Register a service
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            agentId,
            SERVICE_NAME,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        // Gateway still works
        vm.prank(gateway);
        registry.recordUsage(SERVICE_ID, 5, 5000);

        // Recorder also works
        vm.prank(recorder);
        registry.recordUsage(SERVICE_ID, 3, 3000);

        // Cumulative
        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertEq(svc.totalCalls, 8);
        assertEq(svc.totalRevenue, 8000);
    }
}
