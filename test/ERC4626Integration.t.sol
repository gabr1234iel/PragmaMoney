// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";
import {ERC4626ExecutionSchema} from "../src/Wallet/ERC4626ExecutionSchema.sol";
import {MerkleHelper} from "./helpers/MerkleHelper.sol";
import {MockERC20} from "./helpers/MockERC20.sol";
import {MockERC4626Vault} from "./helpers/MockERC4626Vault.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";

contract ERC4626IntegrationTest is Test {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    MockERC20 public asset;
    MockERC4626Vault public vault;
    ERC4626ExecutionSchema public schema;
    MerkleHelper public merkle;
    MerkleHelper.ManageLeaf[] public leafs;
    bytes32[][] public tree;

    AgentSmartAccount public implementation;
    AgentAccountFactory public factory;
    AgentSmartAccount public account;

    address public owner;
    uint256 public ownerKey;
    address public admin;
    uint256 public adminKey;
    address public operator;
    uint256 public operatorKey;
    address public stranger = makeAddr("stranger");

    bytes32 public constant AGENT_ID = keccak256("erc4626-agent");
    uint256 public constant DAILY_LIMIT = 1_000e18;
    uint256 public expiresAt;

    function setUp() public {
        (owner, ownerKey) = makeAddrAndKey("owner");
        (admin, adminKey) = makeAddrAndKey("admin");
        (operator, operatorKey) = makeAddrAndKey("operator");
        expiresAt = block.timestamp + 30 days;

        asset = new MockERC20("Mock Asset", "ASSET", 18);
        vault = new MockERC4626Vault(asset, "Mock Vault", "mVAULT");
        schema = new ERC4626ExecutionSchema(address(vault));

        implementation = new AgentSmartAccount();
        factory = new AgentAccountFactory(address(implementation), ENTRY_POINT, bytes32(0));
        address accountAddr = factory.createAccount(owner, admin, operator, AGENT_ID, DAILY_LIMIT, expiresAt);
        account = AgentSmartAccount(payable(accountAddr));

        vm.startPrank(owner);
        account.setTargetAllowed(address(vault), true);
        account.setTokenAllowed(address(asset), true);
        account.setExecutionSchema(address(vault), address(schema));
        vm.stopPrank();

        merkle = new MerkleHelper();
        leafs = merkle.addERC4626Leafs(address(vault), address(schema), address(account), address(account));

        tree = merkle.generateMerkleTree(leafs);
        bytes32 actionsRoot = merkle.getRoot(tree);
        vm.prank(admin);
        account.setActionsRoot(actionsRoot);
        vm.writeFile("test/fixtures/erc4626.merkle.json", merkle.exportMerkleJson(leafs, tree));

        asset.mint(address(account), 10_000e18);
    }

    function test_Schema_DepositExtractsAddresses() public view {
        bytes memory result = schema.deposit(1e18, address(account));
        assertGt(result.length, 0, "Should extract addresses");
        assertEq(result.length % 20, 0, "Should be packed 20-byte addresses");
    }

    function test_Wallet_DepositAllowed_PassesValidation() public {
        bytes memory vaultCalldata = abi.encodeWithSignature(
            "deposit(uint256,address)",
            1e18,
            address(account)
        );

        PackedUserOperation memory userOp = _buildUserOp(
            abi.encodeWithSelector(account.execute.selector, address(vault), 0, vaultCalldata)
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes memory sig = _signAsOperator(userOpHash);
        (bytes32[] memory leavesFromJson, bytes32[][] memory treeFromJson) = _loadTreeFromJson();
        bytes32 depositLeaf = merkle.computeLeaf(leafs[0]);
        bytes32[] memory proof = _getProofFromTree(depositLeaf, leavesFromJson, treeFromJson);
        userOp.signature = abi.encode(sig, proof);

        vm.prank(ENTRY_POINT);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Deposit should PASS validation");
    }

    function test_Wallet_MintDisallowed_FailsValidation() public {
        bytes memory vaultCalldata = abi.encodeWithSignature(
            "mint(uint256,address)",
            1e18,
            address(account)
        );

        PackedUserOperation memory userOp = _buildUserOp(
            abi.encodeWithSelector(account.execute.selector, address(vault), 0, vaultCalldata)
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes memory sig = _signAsOperator(userOpHash);
        bytes32[] memory proof = new bytes32[](0);
        userOp.signature = abi.encode(sig, proof);

        vm.prank(ENTRY_POINT);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Mint should FAIL validation when action is not allowed");
    }

    function test_Wallet_WrongTargetFailsValidation() public {
        // Deploy a different vault + schema (wrong target for the existing root)
        MockERC4626Vault vault2 = new MockERC4626Vault(asset, "Mock Vault 2", "mVAULT2");
        ERC4626ExecutionSchema schema2 = new ERC4626ExecutionSchema(address(vault2));

        vm.startPrank(owner);
        account.setTargetAllowed(address(vault2), true);
        account.setExecutionSchema(address(vault2), address(schema2));
        vm.stopPrank();

        bytes memory vaultCalldata = abi.encodeWithSignature(
            "deposit(uint256,address)",
            1e18,
            address(account)
        );

        PackedUserOperation memory userOp = _buildUserOp(
            abi.encodeWithSelector(account.execute.selector, address(vault2), 0, vaultCalldata)
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes memory sig = _signAsOperator(userOpHash);
        // Proof is for the original vault (wrong target)
        (bytes32[] memory leavesFromJson, bytes32[][] memory treeFromJson) = _loadTreeFromJson();
        bytes32 leaf = merkle.computeLeaf(leafs[0]);
        bytes32[] memory proof = _getProofFromTree(leaf, leavesFromJson, treeFromJson);
        userOp.signature = abi.encode(sig, proof);

        vm.prank(ENTRY_POINT);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Wrong target should FAIL validation");
    }

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
            signature: ""
        });
    }

    function _signAsOperator(bytes32 hash) internal view returns (bytes memory) {
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function _loadTreeFromJson() internal view returns (bytes32[] memory leaves, bytes32[][] memory treeOut) {
        string memory json = vm.readFile("test/fixtures/erc4626.merkle.json");

        string[] memory leafStrings = vm.parseJsonStringArray(json, ".leaves");
        leaves = new bytes32[](leafStrings.length);
        for (uint256 i; i < leafStrings.length; ++i) {
            leaves[i] = vm.parseBytes32(leafStrings[i]);
        }

        treeOut = _buildTreeFromLeaves(leaves);
    }

    function _buildTreeFromLeaves(bytes32[] memory leaves) internal pure returns (bytes32[][] memory treeOut) {
        if (leaves.length == 0) {
            treeOut = new bytes32[][](0);
            return treeOut;
        }

        uint256 layers;
        uint256 n = leaves.length;
        while (n > 1) {
            layers++;
            n = (n + 1) / 2;
        }
        treeOut = new bytes32[][](layers + 1);

        treeOut[0] = new bytes32[](leaves.length);
        for (uint256 i; i < leaves.length; ++i) {
            treeOut[0][i] = leaves[i];
        }

        n = leaves.length;
        for (uint256 level; level < layers; ++level) {
            uint256 nextN = (n + 1) / 2;
            treeOut[level + 1] = new bytes32[](nextN);
            for (uint256 i; i < nextN; ++i) {
                uint256 idx = i * 2;
                bytes32 left = treeOut[level][idx];
                bytes32 right = idx + 1 < n ? treeOut[level][idx + 1] : left;
                treeOut[level + 1][i] = _hashPair(left, right);
            }
            n = nextN;
        }
    }

    function _getProofFromTree(
        bytes32 leaf,
        bytes32[] memory leaves,
        bytes32[][] memory treeIn
    ) internal pure returns (bytes32[] memory proof) {
        uint256 treeLength = treeIn.length;
        if (treeLength == 0) return new bytes32[](0);

        uint256 idx = type(uint256).max;
        for (uint256 i; i < leaves.length; ++i) {
            if (leaves[i] == leaf) {
                idx = i;
                break;
            }
        }
        require(idx != type(uint256).max, "LeafNotFound");

        proof = new bytes32[](treeLength - 1);
        uint256 n = leaves.length;
        for (uint256 level; level < treeLength - 1; ++level) {
            uint256 siblingIndex = idx ^ 1;
            bytes32 sibling = siblingIndex < n ? treeIn[level][siblingIndex] : treeIn[level][idx];
            proof[level] = sibling;
            idx /= 2;
            n = (n + 1) / 2;
        }
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

}
