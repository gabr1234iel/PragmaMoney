// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library Errors {
    //============================== General ===============================
    error Unauthorized();
    error NotAuthorized();

    error BadAsset();
    error BadOwner();
    error BadAgent();
    error BadIdentity();
    error BadPoolOwner();
    error BadTarget();
    error BadReceiver();
    error BadRegistry();
    error BadValidator();
    error BadTo();
    error BadWallet();

    error NotAgent();
    error NotTokenOwner();
    error NotValidator();

    error AlreadyLinked();
    error PoolExists();
    error AlreadyRevoked();

    error ReservedKey();
    error Expired();
    error DeadlineTooFar();
    error InvalidWalletSig();

    error TooManyDecimals();
    error ValueTooLarge();
    error SelfFeedbackNotAllowed();

    error IndexZero();
    error IndexOutOfBounds();
    error EmptyURI();

    error AssetRescueRequiresPause();
    error AgentRevokedError();
    error TargetNotAllowed();
    error CapExceeded();

    error BadBps();
    error NoPools();
    error NoSummary();
    error BadTagArrayLength();
}
