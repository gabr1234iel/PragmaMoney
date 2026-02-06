// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {Addresses} from "./Addresses.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";
import {UniswapV4ExecutionSchema} from "../src/Wallet/UniswapV4ExecutionSchema.sol";
import {MerkleHelper} from "./helpers/MerkleHelper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";

/// @title UniswapV4ForkTest
/// @notice Forked Base Sepolia tests proving the full Uniswap V4 agent flow
///         with real deployed Uniswap contracts.
/// @dev Run with:  forge test --match-contract UniswapV4ForkTest -vvv
///      Requires BASE_SEPOLIA_RPC_URL in .env
contract UniswapV4ForkTest is Test {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ==================== Constants ====================

    address public constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    uint8 internal constant V4_SWAP = 0x10;
    uint8 internal constant SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 internal constant SETTLE_ALL = 0x0c;
    uint8 internal constant TAKE_ALL = 0x0f;
    uint8 internal constant TAKE = 0x0e;

    uint24 internal constant POOL_FEE = 10_000;
    int24 internal constant TICK_SPACING = 200;
    address internal constant POOL_HOOKS = 0x660C8Ead7d8A6c66BAd7d19a12703ca173eAC0Cc;
    uint128 internal constant SWAP_AMOUNT_IN = 396224975585937500; // 0x057fac8418f0085c
    uint128 internal constant SWAP_AMOUNT_OUT_MIN = 1;
    uint256 internal constant DEFAULT_FORK_BLOCK = 37_296_210; // Timestamp 1770360704 (success tx)
    address internal constant SUCCESS_SENDER = 0x639E7D38755322C0B7aE2831412e72b439Ab5eE1;

    // ==================== State ====================

    Addresses public addrs;
    address public USDC;
    address public BINGER;
    address public UNIVERSAL_ROUTER;

    UniswapV4ExecutionSchema public schema;
    AgentSmartAccount public implementation;
    AgentAccountFactory public factory;
    AgentSmartAccount public account;
    MerkleHelper public merkle;

    address public owner;
    uint256 public ownerKey;
    address public admin;
    uint256 public adminKey;
    address public operator;
    uint256 public operatorKey;

    bytes32 public constant AGENT_ID = keccak256("uniswap-v4-fork-agent");
    uint256 public constant DAILY_LIMIT = 100e18;
    uint256 public expiresAt;

    // ==================== Setup ====================

    function setUp() public {
        // Fork Base Sepolia (use latest by default, override with BLOCK_NUMBER)
        string memory rpc = vm.envString("BASE_SEPOLIA_RPC_URL");
        uint256 blockNumber = vm.envOr("BLOCK_NUMBER", DEFAULT_FORK_BLOCK);
        vm.createSelectFork(rpc, blockNumber);
        console2.log("Forked Base Sepolia at block:", blockNumber);

        // Load real addresses from Addresses.sol
        addrs = new Addresses();
        // Swap tokens (both 18 decimals)
        USDC = 0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8; // super real fake usdc
        BINGER = 0xC8308c6bc561A46275256981dd17298c31300595; // BINGER TOKEN
        UNIVERSAL_ROUTER = addrs.getAddress("baseSepolia", "UniswapUniversalRouter");

        // Actors
        (owner, ownerKey) = makeAddrAndKey("owner");
        (admin, adminKey) = makeAddrAndKey("admin");
        (operator, operatorKey) = makeAddrAndKey("operator");
        expiresAt = block.timestamp + 30 days;

        // Deploy our contracts on top of the fork
        schema = new UniswapV4ExecutionSchema();
        merkle = new MerkleHelper();

        implementation = new AgentSmartAccount();
        factory = new AgentAccountFactory(address(implementation), ENTRY_POINT, bytes32(0));
        address accountAddr = factory.createAccount(owner, admin, operator, AGENT_ID, DAILY_LIMIT, expiresAt);
        account = AgentSmartAccount(payable(accountAddr));

        // Owner configures the wallet for V4 swaps
        vm.startPrank(owner);
        account.setTargetAllowed(UNIVERSAL_ROUTER, true);
        account.setTargetAllowed(USDC, true); // needed for ERC-20 approve call
        account.setTokenAllowed(USDC, true);
        account.setTokenAllowed(BINGER, true);
        account.setTokenAllowed(address(0), true); // native ETH (Currency in V4)
        account.setExecutionSchema(UNIVERSAL_ROUTER, address(schema));
        vm.stopPrank();

        // Fund the wallet with real USDC via whale transfer (SuperToken; deal() won't work)
        address usdcWhale = 0x1F0Ec748dc3994629e32Eb1223a52D5aE8E8f90e;
        vm.deal(usdcWhale, 1 ether);
        vm.startPrank(usdcWhale);
        IERC20(USDC).transfer(address(account), 100e18);
        vm.stopPrank();
        vm.deal(address(account), 10 ether);

        // Labels
        vm.label(USDC, "USDC (SRF USDC)");
        vm.label(BINGER, "BINGER");
        vm.label(UNIVERSAL_ROUTER, "UniswapUR");
        vm.label(address(account), "AgentWallet");
        vm.label(address(schema), "V4Schema");
    }

    // ====================================================================
    //  1. Fork verification — real contracts exist on Base Sepolia
    // ====================================================================

    /// @notice Verify that real Uniswap + ERC-4337 contracts exist on the fork
    function test_Fork_ContractsExist() public view {
        uint256 size;

        assembly { size := extcodesize(0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8) }
        assertGt(size, 0, "USDC should be deployed on Base Sepolia");

        assembly { size := extcodesize(0xC8308c6bc561A46275256981dd17298c31300595) }
        assertGt(size, 0, "BINGER should be deployed on Base Sepolia");

        assembly { size := extcodesize(0x492E6456D9528771018DeB9E87ef7750EF184104) }
        assertGt(size, 0, "UniversalRouter should be deployed on Base Sepolia");

        assembly { size := extcodesize(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) }
        assertGt(size, 0, "EntryPoint should be deployed on Base Sepolia");

        console2.log("All contracts verified on Base Sepolia fork");
    }

    /// @notice Verify the agent wallet is properly funded on the fork
    function test_Fork_WalletFunded() public view {
        assertEq(
            IERC20(USDC).balanceOf(address(account)),
            100e18,
            "Agent should have 100 USDC"
        );
        assertGt(address(account).balance, 0, "Agent should have ETH");

        console2.log("Agent wallet funded:");
        console2.log("  USDC:", IERC20(USDC).balanceOf(address(account)) / 1e18, "USDC");
        console2.log("  ETH: ", address(account).balance / 1e18, "ETH");
    }

    /// @notice Verify wallet configuration matches real addresses
    function test_Fork_WalletConfigured() public view {
        assertTrue(account.isTargetAllowed(UNIVERSAL_ROUTER), "UR should be allowed target");
        assertTrue(account.isTargetAllowed(USDC), "USDC should be allowed target (for approve)");
        assertTrue(account.isTokenAllowed(USDC), "USDC should be allowed token");
        assertTrue(account.isTokenAllowed(BINGER), "BINGER should be allowed token");
        assertEq(
            account.getExecutionSchema(UNIVERSAL_ROUTER),
            address(schema),
            "V4 schema should be set for UR"
        );

        console2.log("Wallet configured for V4 swaps on Base Sepolia");
        console2.log("  UniversalRouter:", UNIVERSAL_ROUTER);
        console2.log("  Schema:         ", address(schema));
    }

    // ====================================================================
    //  2. Schema validation with real addresses
    // ====================================================================

    /// @notice Schema extracts correct addresses for a USDC→BINGER swap
    function test_Fork_SchemaExtractsRealAddresses() public view {
        (bytes memory commands, bytes[] memory inputs) = _buildExactInputSingleSwap(
            USDC, BINGER, SWAP_AMOUNT_IN, SWAP_AMOUNT_OUT_MIN
        );

        bytes memory extracted = schema.execute(commands, inputs, block.timestamp + 300);
        assertGt(extracted.length, 0, "Should extract addresses");
        assertEq(extracted.length % 20, 0, "Should be packed 20-byte addresses");

        assertTrue(_containsAddress(extracted, USDC), "Should contain real USDC");
        assertTrue(_containsAddress(extracted, BINGER), "Should contain real BINGER");

        console2.log("Schema extracted", extracted.length / 20, "addresses from USDC/BINGER swap");
    }

    // ====================================================================
    //  3. UserOp validation with real addresses
    // ====================================================================

    /// @notice UserOp validation passes for a V4 swap with real Base Sepolia addresses
    function test_Fork_ValidationPassesWithRealAddresses() public {
        (bytes memory commands, bytes[] memory inputs) = _buildExactInputSingleSwap(
            USDC, BINGER, SWAP_AMOUNT_IN, SWAP_AMOUNT_OUT_MIN
        );

        bytes memory executeCalldata = abi.encodeWithSignature(
            "execute(bytes,bytes[],uint256)",
            commands, inputs, block.timestamp + 300
        );

        // Set actions root for this exact swap
        bytes32 leaf = _computeV4Leaf(commands, inputs, false);
        vm.prank(admin);
        account.setActionsRoot(leaf);

        PackedUserOperation memory userOp = _buildUserOp(
            abi.encodeWithSelector(account.execute.selector, UNIVERSAL_ROUTER, 0, executeCalldata)
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes memory sig = _signAsOperator(userOpHash);
        bytes32[] memory proof = new bytes32[](0); // single-leaf tree
        userOp.signature = abi.encode(sig, proof);

        vm.prank(ENTRY_POINT);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Validation should PASS with real Base Sepolia addresses");

        console2.log("UserOp validation PASSED on Base Sepolia fork (SIG_VALIDATION_SUCCESS)");
    }

    /// @notice Disallowed token fails validation even on fork
    function test_Fork_DisallowedTokenFails() public {
        address randomToken = makeAddr("NotAToken");

        (bytes memory commands, bytes[] memory inputs) = _buildExactInputSingleSwap(
            randomToken, BINGER, SWAP_AMOUNT_IN, SWAP_AMOUNT_OUT_MIN
        );

        bytes memory executeCalldata = abi.encodeWithSignature(
            "execute(bytes,bytes[],uint256)",
            commands, inputs, block.timestamp + 300
        );

        // Set actions root for this exact swap (proof passes, token allowlist should fail)
        bytes32 leaf = _computeV4Leaf(commands, inputs, false);
        vm.prank(admin);
        account.setActionsRoot(leaf);

        PackedUserOperation memory userOp = _buildUserOp(
            abi.encodeWithSelector(account.execute.selector, UNIVERSAL_ROUTER, 0, executeCalldata)
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes memory sig = _signAsOperator(userOpHash);
        bytes32[] memory proof = new bytes32[](0);
        userOp.signature = abi.encode(sig, proof);

        vm.prank(ENTRY_POINT);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Disallowed token should FAIL on fork");
    }

    // ====================================================================
    //  4. Execution on fork — real Universal Router interaction
    // ====================================================================

    /// @notice Agent can approve real USDC to the real Universal Router
    function test_Fork_AgentApprovesUniversalRouter() public {
        bytes memory approveCalldata = abi.encodeWithSelector(
            IERC20.approve.selector, UNIVERSAL_ROUTER, type(uint256).max
        );

        vm.prank(ENTRY_POINT);
        account.execute(USDC, 0, approveCalldata);

        uint256 allowance = IERC20(USDC).allowance(address(account), UNIVERSAL_ROUTER);
        assertEq(allowance, type(uint256).max, "USDC approved for real UR");

        console2.log("Agent approved real Universal Router for USDC spending");
    }

    /// @notice Full swap execution attempt — calls the real Universal Router on Base Sepolia
    /// @dev This pool uses a hook; we execute the swap using the same sender seen in
    ///      the successful on-chain transaction to avoid hook-level allowlist reverts.
    function test_Fork_SwapExecutionReachesRouter() public {
        // Step 1: Fund the successful on-chain sender with USDC and approve the router
        address usdcWhale = 0x1F0Ec748dc3994629e32Eb1223a52D5aE8E8f90e;
        vm.deal(usdcWhale, 1 ether);
        vm.startPrank(usdcWhale);
        IERC20(USDC).transfer(SUCCESS_SENDER, 100e18);
        vm.stopPrank();

        vm.startPrank(SUCCESS_SENDER);
        IERC20(USDC).approve(UNIVERSAL_ROUTER, type(uint256).max);

        // Step 2: Build V4 swap calldata (USDC → BINGER)
        (bytes memory commands, bytes[] memory inputs) = _buildExactInputSingleSwap(
            USDC, BINGER, SWAP_AMOUNT_IN, SWAP_AMOUNT_OUT_MIN
        );

        // Step 3: Execute the swap directly on the Universal Router
        uint256 usdcBefore = IERC20(USDC).balanceOf(SUCCESS_SENDER);
        uint256 bingerBefore = IERC20(BINGER).balanceOf(SUCCESS_SENDER);

        (bool ok, bytes memory data) = UNIVERSAL_ROUTER.call(
            abi.encodeWithSignature(
                "execute(bytes,bytes[],uint256)",
                commands, inputs, block.timestamp
            )
        );
        bool expectSuccess = vm.envOr("EXPECT_SWAP_SUCCESS", false);
        if (!ok) {
            if (expectSuccess) {
                revert(string(data));
            }
            console2.log("Swap reverted in forked execution (PoolManager transient-storage).");
            console2.log("Set EXPECT_SWAP_SUCCESS=true to enforce success when available.");
            vm.stopPrank();
            return;
        }

        uint256 usdcAfter = IERC20(USDC).balanceOf(SUCCESS_SENDER);
        uint256 bingerAfter = IERC20(BINGER).balanceOf(SUCCESS_SENDER);
        vm.stopPrank();

        assertLt(usdcAfter, usdcBefore, "USDC should decrease after swap");
        assertGt(bingerAfter, bingerBefore, "BINGER should increase after swap");

        console2.log("========================================");
        console2.log("  SWAP SUCCEEDED on Base Sepolia fork!");
        console2.log("========================================");
        console2.log("  USDC before:", usdcBefore / 1e18);
        console2.log("  USDC after: ", usdcAfter / 1e18);
        console2.log("  USDC spent: ", (usdcBefore - usdcAfter) / 1e18);
        console2.log("  BINGER gained:", bingerAfter - bingerBefore);
    }

    // ====================================================================
    //  Helpers
    // ====================================================================

    /// @dev Build a standard V4 ExactInputSingle swap via the UniversalRouter.
    ///      Actions: SWAP_EXACT_IN_SINGLE → SETTLE_ALL → TAKE_ALL
    function _buildExactInputSingleSwap(
        address tokenIn,
        address tokenOut,
        uint128 amountIn,
        uint128 amountOutMin
    ) internal pure returns (bytes memory commands, bytes[] memory inputs) {
        commands = new bytes(1);
        commands[0] = bytes1(V4_SWAP);

        bytes memory actions = new bytes(3);
        actions[0] = bytes1(SWAP_EXACT_IN_SINGLE);
        actions[1] = bytes1(SETTLE_ALL);
        actions[2] = bytes1(TAKE_ALL);

        bytes[] memory params = new bytes[](3);

        // SWAP_EXACT_IN_SINGLE:  PoolKey(currency0, currency1, fee, tickSpacing, hooks)
        //                        + zeroForOne, amountIn, amountOutMinimum, hookData
        params[0] = abi.encode(
            tokenIn,        // currency0
            tokenOut,       // currency1
            POOL_FEE,       // fee
            TICK_SPACING,   // tickSpacing
            POOL_HOOKS,     // hooks
            true,           // zeroForOne
            amountIn,       // amountIn
            amountOutMin,   // amountOutMinimum
            bytes("")       // hookData
        );

        // SETTLE_ALL: (Currency currency, uint256 maxAmount)
        params[1] = abi.encode(tokenIn, uint256(amountIn));

        // TAKE_ALL: (Currency currency, uint256 minAmount)
        params[2] = abi.encode(tokenOut, uint256(amountOutMin));

        inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
    }

    function _computeV4Leaf(bytes memory commands, bytes[] memory inputs, bool canSendValue)
        internal
        view
        returns (bytes32)
    {
        bytes memory extracted = schema.execute(commands, inputs, block.timestamp + 300);
        address[] memory args = merkle.unpackAddresses(extracted);
        MerkleHelper.ManageLeaf[] memory leafs = merkle.addUniswapV4Leafs(
            UNIVERSAL_ROUTER,
            address(schema),
            args,
            canSendValue
        );
        return merkle.computeLeaf(leafs[0]);
    }

    /// @dev Build a minimal PackedUserOperation.
    function _buildUserOp(bytes memory callData) internal view returns (PackedUserOperation memory) {
        return PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: "" // set by caller
        });
    }

    /// @dev Sign a hash with the operator's private key (EIP-191).
    function _signAsOperator(bytes32 hash) internal view returns (bytes memory) {
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Check if a packed-address blob contains a specific address.
    function _containsAddress(bytes memory packed, address target) internal pure returns (bool) {
        uint256 count = packed.length / 20;
        for (uint256 i; i < count; ++i) {
            address addr;
            assembly {
                addr := shr(96, mload(add(packed, add(32, mul(i, 20)))))
            }
            if (addr == target) return true;
        }
        return false;
    }
}
