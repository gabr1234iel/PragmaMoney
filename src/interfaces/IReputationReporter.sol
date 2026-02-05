// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReputationReporter {
    function setReporter(address reporter, bool enabled) external;
}
