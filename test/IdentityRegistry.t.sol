// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {Errors} from "../src/errors/Errors.sol";
import {BaseTest} from "./BaseTest.t.sol";

contract IdentityRegistryTest is BaseTest {
    IIdentityRegistry internal id;

    bytes32 internal constant AGENT_WALLET_SET_TYPEHASH =
        keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)");

    function setUp() public {
        _startFork();
        vm.startPrank(deployer);
        id = _deployIdentity();
        vm.stopPrank();
    }

    // Helper: substring check
    function _contains(string memory a, string memory b) internal pure returns (bool) {
        return bytes(a).length >= bytes(b).length && _indexOf(a, b) != type(uint256).max;
    }

    function _indexOf(string memory a, string memory b) internal pure returns (uint256) {
        bytes memory aa = bytes(a);
        bytes memory bb = bytes(b);
        if (bb.length == 0 || aa.length < bb.length) return type(uint256).max;
        for (uint256 i = 0; i <= aa.length - bb.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < bb.length; j++) {
                if (aa[i + j] != bb[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return i;
        }
        return type(uint256).max;
    }

    function _domainSeparator(address verifyingContract) internal view returns (bytes32) {
        bytes32 typeHash = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        return keccak256(
            abi.encode(
                typeHash,
                keccak256(bytes("ERC8004IdentityRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                verifyingContract
            )
        );
    }

    function _digest(address verifyingContract, uint256 agentId, address newWallet, address owner, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(AGENT_WALLET_SET_TYPEHASH, agentId, newWallet, owner, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(verifyingContract), structHash));
    }

    /// @notice agent registers and URI is stored
    function test_register_mintsToken_andSetsTokenURI() public {
        string memory agentURI = "file://metadata/agent-1.json";

        vm.prank(agentOwner);
        uint256 agentId = id.register(agentURI);

        assertEq(id.ownerOf(agentId), agentOwner);
        assertEq(id.tokenURI(agentId), agentURI);
    }

    /// @notice agentId increments sequentially
    function test_register_incrementsAgentId_sequentially() public {
        vm.prank(agentOwner);
        uint256 id1 = id.register("file://metadata/agent-1.json");
        vm.prank(alice);
        uint256 id2 = id.register("file://metadata/agent-2.json");

        assertEq(id1 + 1, id2);
    }

    /// @notice only owner/approved can set agent URI
    function test_setAgentURI_onlyOwnerOrApproved() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(bob);
        vm.expectRevert(bytes("Not authorized"));
        id.setAgentURI(agentId, "file://metadata/agent-2.json");

        vm.prank(agentOwner);
        id.setAgentURI(agentId, "file://metadata/agent-2.json");
        assertEq(id.tokenURI(agentId), "file://metadata/agent-2.json");
    }

    /// @notice metadata set/get roundtrip
    function test_metadata_set_and_get_roundtrip() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        bytes memory val = abi.encodePacked(bytes32("capabilitiesHash"));
        vm.prank(agentOwner);
        id.setMetadata(agentId, "capabilitiesHash", val);

        bytes memory got = id.getMetadata(agentId, "capabilitiesHash");
        assertEq(got, val);
    }

    /// @notice agent wallet default and update via EOA signature
    function test_agentWallet_default_and_update() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");
        assertEq(id.getAgentWallet(agentId), agentOwner);

        uint256 newWalletPk = 0xA11CE;
        address newWallet = vm.addr(newWalletPk);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes32 digest = _digest(address(id), agentId, newWallet, agentOwner, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newWalletPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(agentOwner);
        id.setAgentWallet(agentId, newWallet, deadline, sig);
        assertEq(id.getAgentWallet(agentId), newWallet);

        uint256 badPk = 0xBADD0D;
        (v, r, s) = vm.sign(badPk, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(agentOwner);
        vm.expectRevert(bytes("invalid wallet sig"));
        id.setAgentWallet(agentId, newWallet, deadline, badSig);
    }

    /// @notice agent wallet cleared on transfer
    function test_agentWallet_cleared_on_transfer() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        uint256 newWalletPk = 0xA11CE;
        address newWallet = vm.addr(newWalletPk);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes32 digest = _digest(address(id), agentId, newWallet, agentOwner, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newWalletPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(agentOwner);
        id.setAgentWallet(agentId, newWallet, deadline, sig);
        assertEq(id.getAgentWallet(agentId), newWallet);

        vm.prank(agentOwner);
        id.transferFrom(agentOwner, bob, agentId);

        assertEq(id.getAgentWallet(agentId), address(0));
    }

    /// @notice isAuthorizedOrOwner returns true for owner/approved, false for others
    function test_isAuthorizedOrOwner_behavior() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        assertTrue(id.isAuthorizedOrOwner(agentOwner, agentId));
        assertFalse(id.isAuthorizedOrOwner(bob, agentId));

        vm.prank(agentOwner);
        id.approve(bob, agentId);
        assertTrue(id.isAuthorizedOrOwner(bob, agentId));
    }

    /// @notice metadata JSON content sanity checks
    function test_metadata_json_contains_expected_fields() public {
        string memory json = vm.readFile("metadata/agent-1.json");
        assertTrue(_contains(json, "\"type\": \"https://eips.ethereum.org/EIPS/eip-8004#registration-v1\""));
        assertTrue(_contains(json, "\"name\": \"Agent One\""));
        assertTrue(_contains(json, "\"services\""));
        assertTrue(_contains(json, "\"x402Support\""));
    }
}
