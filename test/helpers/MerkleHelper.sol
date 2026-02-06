// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title MerkleHelper (ManageLeaf format)
/// @notice Utility to build Merkle trees/proofs using ManageLeaf digest format:
///         keccak256(abi.encodePacked(executionSchema, target, canSendValue, selector, addressArgs...))
contract MerkleHelper {
    // ========================================= ManageLeaf =========================================

    struct ManageLeaf {
        address target;
        bool canSendValue;
        string signature;
        address[] argumentAddresses;
        string description;
        address executionSchema;
        uint256 leafIndex;
        string protocolName;
    }

    // ========================================= Leaf Helpers =========================================

    function makeLeaf(
        address target,
        bool canSendValue,
        string memory signature,
        address[] memory argumentAddresses,
        string memory description,
        address executionSchema,
        uint256 leafIndex,
        string memory protocolName
    ) external pure returns (ManageLeaf memory leaf) {
        leaf = ManageLeaf({
            target: target,
            canSendValue: canSendValue,
            signature: signature,
            argumentAddresses: argumentAddresses,
            description: description,
            executionSchema: executionSchema,
            leafIndex: leafIndex,
            protocolName: protocolName
        });
    }

    function unpackAddresses(bytes memory packed) public pure returns (address[] memory addrs) {
        if (packed.length == 0) return new address[](0);
        require(packed.length % 20 == 0, "Packed length must be multiple of 20");
        uint256 count = packed.length / 20;
        addrs = new address[](count);
        for (uint256 i; i < count; ++i) {
            address addr;
            assembly {
                addr := shr(96, mload(add(packed, add(32, mul(i, 20)))))
            }
            addrs[i] = addr;
        }
    }

    function addERC4626Leafs(
        address vault,
        address executionSchema,
        address receiver,
        address owner
    ) external pure returns (ManageLeaf[] memory leafs) {
        leafs = new ManageLeaf[](2);

        {
            address[] memory args = new address[](1);
            args[0] = receiver;
            leafs[0] = ManageLeaf({
                target: vault,
                canSendValue: false,
                signature: "deposit(uint256,address)",
                argumentAddresses: args,
                description: "ERC4626 deposit",
                executionSchema: executionSchema,
                leafIndex: 0,
                protocolName: "ERC4626"
            });
        }

        {
            address[] memory args = new address[](2);
            args[0] = receiver;
            args[1] = owner;
            leafs[1] = ManageLeaf({
                target: vault,
                canSendValue: false,
                signature: "withdraw(uint256,address,address)",
                argumentAddresses: args,
                description: "ERC4626 withdraw",
                executionSchema: executionSchema,
                leafIndex: 1,
                protocolName: "ERC4626"
            });
        }
    }

    function addUniswapV4Leafs(
        address universalRouter,
        address executionSchema,
        address[] memory argumentAddresses,
        bool canSendValue
    ) external pure returns (ManageLeaf[] memory leafs) {
        leafs = new ManageLeaf[](1);
        leafs[0] = ManageLeaf({
            target: universalRouter,
            canSendValue: canSendValue,
            signature: "execute(bytes,bytes[],uint256)",
            argumentAddresses: argumentAddresses,
            description: "Uniswap V4 Universal Router execute",
            executionSchema: executionSchema,
            leafIndex: 0,
            protocolName: "Uniswap V4"
        });
    }

    function computeLeaf(ManageLeaf memory leaf) public pure returns (bytes32 digest) {
        bytes4 selector = bytes4(keccak256(abi.encodePacked(leaf.signature)));
        bytes memory packedData;
        for (uint256 i; i < leaf.argumentAddresses.length; ++i) {
            packedData = abi.encodePacked(packedData, leaf.argumentAddresses[i]);
        }
        digest = keccak256(
            abi.encodePacked(
                leaf.executionSchema,
                leaf.target,
                leaf.canSendValue,
                selector,
                packedData
            )
        );
    }

    // ========================================= Merkle Tree =========================================

    function generateMerkleTree(ManageLeaf[] memory leafs) public pure returns (bytes32[][] memory tree) {
        uint256 leafsLength = leafs.length;
        bytes32[][] memory layers = new bytes32[][](1);
        layers[0] = new bytes32[](leafsLength);
        for (uint256 i; i < leafsLength; ++i) {
            layers[0][i] = computeLeaf(leafs[i]);
        }
        tree = _buildTrees(layers);
    }

    function getRoot(bytes32[][] memory tree) public pure returns (bytes32 root) {
        if (tree.length == 0) return bytes32(0);
        root = tree[tree.length - 1][0];
    }

    function getProof(bytes32 leaf, bytes32[][] memory tree) public pure returns (bytes32[] memory proof) {
        uint256 treeLength = tree.length;
        if (treeLength == 0) return new bytes32[](0);

        proof = new bytes32[](treeLength - 1);
        for (uint256 i; i < treeLength - 1; ++i) {
            bool found;
            for (uint256 j; j < tree[i].length; ++j) {
                if (leaf == tree[i][j]) {
                    uint256 siblingIndex = j ^ 1;
                    proof[i] = siblingIndex < tree[i].length ? tree[i][siblingIndex] : tree[i][j];
                    leaf = _hashPair(leaf, proof[i]);
                    found = true;
                    break;
                }
            }
            if (!found) revert("Leaf not found in tree");
        }
    }

    function getProofsUsingTree(ManageLeaf[] memory leafs, bytes32[][] memory tree)
        public
        pure
        returns (bytes32[][] memory proofs)
    {
        proofs = new bytes32[][](leafs.length);
        for (uint256 i; i < leafs.length; ++i) {
            proofs[i] = getProof(computeLeaf(leafs[i]), tree);
        }
    }

    // ========================================= JSON Export =========================================

    /// @notice Export a lightweight JSON with root, leaves, and tree layers.
    /// @dev Intended for tests/off-chain tooling (small trees).
    function exportMerkleJson(ManageLeaf[] memory leafs, bytes32[][] memory tree)
        external
        pure
        returns (string memory)
    {
        bytes32 root = getRoot(tree);
        string memory json = string.concat(
            "{\"root\":\"",
            Strings.toHexString(uint256(root), 32),
            "\",\"leaves\":["
        );
        for (uint256 i; i < leafs.length; ++i) {
            json = string.concat(json, "\"", Strings.toHexString(uint256(computeLeaf(leafs[i])), 32), "\"");
            if (i + 1 < leafs.length) json = string.concat(json, ",");
        }
        json = string.concat(json, "],\"tree\":[");
        for (uint256 i; i < tree.length; ++i) {
            json = string.concat(json, "[");
            for (uint256 j; j < tree[i].length; ++j) {
                json = string.concat(json, "\"", Strings.toHexString(uint256(tree[i][j]), 32), "\"");
                if (j + 1 < tree[i].length) json = string.concat(json, ",");
            }
            json = string.concat(json, "]");
            if (i + 1 < tree.length) json = string.concat(json, ",");
        }
        json = string.concat(json, "]}");
        return json;
    }

    // ========================================= Internal =========================================

    function _buildTrees(bytes32[][] memory merkleTreeIn) internal pure returns (bytes32[][] memory merkleTreeOut) {
        uint256 merkleTreeInLength = merkleTreeIn.length;
        merkleTreeOut = new bytes32[][](merkleTreeInLength + 1);

        uint256 layerLength;
        for (uint256 i; i < merkleTreeInLength; ++i) {
            layerLength = merkleTreeIn[i].length;
            merkleTreeOut[i] = new bytes32[](layerLength);
            for (uint256 j; j < layerLength; ++j) {
                merkleTreeOut[i][j] = merkleTreeIn[i][j];
            }
        }

        uint256 nextLayerLength = (layerLength + 1) / 2;
        merkleTreeOut[merkleTreeInLength] = new bytes32[](nextLayerLength);

        uint256 count;
        for (uint256 i; i < layerLength; i += 2) {
            bytes32 left = merkleTreeIn[merkleTreeInLength - 1][i];
            bytes32 right =
                i + 1 < layerLength ? merkleTreeIn[merkleTreeInLength - 1][i + 1] : left;
            merkleTreeOut[merkleTreeInLength][count] = _hashPair(left, right);
            count++;
        }

        if (nextLayerLength > 1) {
            merkleTreeOut = _buildTrees(merkleTreeOut);
        }
    }

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a < b ? _efficientHash(a, b) : _efficientHash(b, a);
    }

    function _efficientHash(bytes32 a, bytes32 b) private pure returns (bytes32 value) {
        assembly ("memory-safe") {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }
}
