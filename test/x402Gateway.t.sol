// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {x402Gateway} from "../src/x402/x402Gateway.sol";
import {Ix402Gateway} from "../src/x402/interfaces/Ix402Gateway.sol";
import {ServiceRegistry} from "../src/x402/ServiceRegistry.sol";
import {IServiceRegistry} from "../src/x402/interfaces/IServiceRegistry.sol";
import {MockERC20} from "./helpers/MockERC20.sol";

contract x402GatewayTest is Test {
    x402Gateway public gateway;
    ServiceRegistry public registry;
    MockERC20 public usdc;

    address public registryOwner = makeAddr("registryOwner");
    address public serviceOwner = makeAddr("serviceOwner");
    address public payer = makeAddr("payer");
    address public stranger = makeAddr("stranger");

    bytes32 public constant SERVICE_ID = keccak256("test-service-1");
    uint256 public constant PRICE_PER_CALL = 1000; // 0.001 USDC
    string public constant ENDPOINT = "https://api.example.com/v1";

    function setUp() public {
        // Deploy USDC mock (6 decimals)
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy ServiceRegistry
        registry = new ServiceRegistry(registryOwner);

        // Deploy gateway
        gateway = new x402Gateway(address(registry), address(usdc));

        // Set gateway as authorized on registry
        vm.prank(registryOwner);
        registry.setGateway(address(gateway));

        // Register a test service
        vm.prank(serviceOwner);
        registry.registerService(
            SERVICE_ID,
            PRICE_PER_CALL,
            ENDPOINT,
            IServiceRegistry.ServiceType.API
        );

        // Mint USDC to payer and approve gateway
        usdc.mint(payer, 1_000_000e6); // 1M USDC
        vm.prank(payer);
        usdc.approve(address(gateway), type(uint256).max);
    }

    // ==================== payForService ====================

    function test_PayForService_SingleCall() public {
        uint256 calls = 1;
        uint256 expectedTotal = PRICE_PER_CALL * calls;
        uint256 payerBalBefore = usdc.balanceOf(payer);
        uint256 ownerBalBefore = usdc.balanceOf(serviceOwner);

        vm.prank(payer);
        bytes32 paymentId = gateway.payForService(SERVICE_ID, calls);

        // Verify USDC transfer
        assertEq(usdc.balanceOf(payer), payerBalBefore - expectedTotal);
        assertEq(usdc.balanceOf(serviceOwner), ownerBalBefore + expectedTotal);

        // Verify payment record
        Ix402Gateway.Payment memory payment = gateway.getPayment(paymentId);
        assertEq(payment.payer, payer);
        assertEq(payment.serviceId, SERVICE_ID);
        assertEq(payment.calls, calls);
        assertEq(payment.amount, expectedTotal);
        assertTrue(payment.valid);
    }

    function test_PayForService_MultipleCalls() public {
        uint256 calls = 100;
        uint256 expectedTotal = PRICE_PER_CALL * calls;

        vm.prank(payer);
        bytes32 paymentId = gateway.payForService(SERVICE_ID, calls);

        Ix402Gateway.Payment memory payment = gateway.getPayment(paymentId);
        assertEq(payment.amount, expectedTotal);
        assertEq(payment.calls, calls);
    }

    function test_PayForService_EmitsServicePaid() public {
        uint256 calls = 5;
        uint256 expectedTotal = PRICE_PER_CALL * calls;

        // We cannot predict the exact paymentId ahead of time because it depends on nonce,
        // but we can check the indexed parameters
        vm.prank(payer);

        // Expect event with indexed: payer, serviceId, paymentId; non-indexed: calls, amount
        // We check topic1 (payer) and topic2 (serviceId) but skip topic3 (paymentId)
        vm.expectEmit(true, true, false, true);
        emit Ix402Gateway.ServicePaid(payer, SERVICE_ID, calls, expectedTotal, bytes32(0));

        gateway.payForService(SERVICE_ID, calls);
    }

    function test_PayForService_UniquePaymentIds() public {
        vm.startPrank(payer);

        bytes32 id1 = gateway.payForService(SERVICE_ID, 1);
        bytes32 id2 = gateway.payForService(SERVICE_ID, 1);
        bytes32 id3 = gateway.payForService(SERVICE_ID, 1);

        vm.stopPrank();

        // All IDs must be unique
        assertTrue(id1 != id2);
        assertTrue(id2 != id3);
        assertTrue(id1 != id3);
    }

    function test_PayForService_UpdatesRegistryUsage() public {
        uint256 calls = 10;
        uint256 expectedTotal = PRICE_PER_CALL * calls;

        vm.prank(payer);
        gateway.payForService(SERVICE_ID, calls);

        IServiceRegistry.Service memory svc = registry.getService(SERVICE_ID);
        assertEq(svc.totalCalls, calls);
        assertEq(svc.totalRevenue, expectedTotal);
    }

    function test_PayForService_RevertZeroCalls() public {
        vm.prank(payer);
        vm.expectRevert(x402Gateway.ZeroCalls.selector);
        gateway.payForService(SERVICE_ID, 0);
    }

    function test_PayForService_RevertServiceNotFound() public {
        bytes32 unknownId = keccak256("nonexistent");

        vm.prank(payer);
        vm.expectRevert(); // ServiceNotFound from registry
        gateway.payForService(unknownId, 1);
    }

    function test_PayForService_RevertServiceNotActive() public {
        // Deactivate service
        vm.prank(serviceOwner);
        registry.deactivateService(SERVICE_ID);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(x402Gateway.ServiceNotActive.selector, SERVICE_ID)
        );
        gateway.payForService(SERVICE_ID, 1);
    }

    function test_PayForService_RevertInsufficientApproval() public {
        // Reset approval to 0
        vm.prank(payer);
        usdc.approve(address(gateway), 0);

        vm.prank(payer);
        vm.expectRevert(); // SafeERC20: ERC20 operation did not succeed / insufficient allowance
        gateway.payForService(SERVICE_ID, 1);
    }

    function test_PayForService_RevertInsufficientBalance() public {
        // Create a payer with no USDC
        address brokePayer = makeAddr("brokePayer");
        vm.prank(brokePayer);
        usdc.approve(address(gateway), type(uint256).max);

        vm.prank(brokePayer);
        vm.expectRevert(); // ERC20: transfer amount exceeds balance
        gateway.payForService(SERVICE_ID, 1);
    }

    // ==================== verifyPayment ====================

    function test_VerifyPayment_ValidPayment() public {
        uint256 calls = 3;
        uint256 expectedTotal = PRICE_PER_CALL * calls;

        vm.prank(payer);
        bytes32 paymentId = gateway.payForService(SERVICE_ID, calls);

        (bool valid, address payerAddr, uint256 amount) = gateway.verifyPayment(paymentId);
        assertTrue(valid);
        assertEq(payerAddr, payer);
        assertEq(amount, expectedTotal);
    }

    function test_VerifyPayment_NonexistentPayment() public view {
        bytes32 fakeId = keccak256("fake-payment");

        (bool valid, address payerAddr, uint256 amount) = gateway.verifyPayment(fakeId);
        assertFalse(valid);
        assertEq(payerAddr, address(0));
        assertEq(amount, 0);
    }

    // ==================== getPayment ====================

    function test_GetPayment_ReturnsFullStruct() public {
        vm.prank(payer);
        bytes32 paymentId = gateway.payForService(SERVICE_ID, 7);

        Ix402Gateway.Payment memory payment = gateway.getPayment(paymentId);
        assertEq(payment.payer, payer);
        assertEq(payment.serviceId, SERVICE_ID);
        assertEq(payment.calls, 7);
        assertEq(payment.amount, PRICE_PER_CALL * 7);
        assertTrue(payment.valid);
    }

    // ==================== Fuzz tests ====================

    function testFuzz_PayForService_VariousCalls(uint256 calls) public {
        // Bound calls to a reasonable range to avoid overflow with price
        calls = bound(calls, 1, 1_000_000);
        uint256 total = PRICE_PER_CALL * calls;

        // Ensure payer has enough
        if (total > usdc.balanceOf(payer)) {
            usdc.mint(payer, total);
        }

        vm.prank(payer);
        bytes32 paymentId = gateway.payForService(SERVICE_ID, calls);

        Ix402Gateway.Payment memory payment = gateway.getPayment(paymentId);
        assertEq(payment.amount, total);
        assertTrue(payment.valid);
    }

    // ==================== nonce ====================

    function test_NonceIncrementsOnEachPayment() public {
        assertEq(gateway.nonce(), 0);

        vm.startPrank(payer);
        gateway.payForService(SERVICE_ID, 1);
        assertEq(gateway.nonce(), 1);

        gateway.payForService(SERVICE_ID, 1);
        assertEq(gateway.nonce(), 2);

        gateway.payForService(SERVICE_ID, 1);
        assertEq(gateway.nonce(), 3);
        vm.stopPrank();
    }
}
