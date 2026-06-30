// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DialRegistry} from "../contracts/DialRegistry.sol";

// Minimal cheatcode interface (avoids a forge-std install).
interface Vm {
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
}

contract DialRegistryTest {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    DialRegistry reg;
    address owner = address(0xD1A1);
    address alice = address(0xA11CE);
    bytes32 attHash = keccak256("att");
    bytes32 addrHash = keccak256("addresses");

    function setUp() public {
        reg = new DialRegistry(owner); // owner = arg, independent of deployer
    }

    function _nh(string memory n) internal pure returns (bytes32) {
        return keccak256(bytes(n));
    }

    function testSetRecordAndRead() public {
        vm.prank(owner);
        reg.setRecord("alice.dial", alice, 111, attHash, addrHash, 1);
        DialRegistry.Record memory r = reg.getRecord(_nh("alice.dial"));
        require(r.owner == alice, "owner");
        require(r.expiresAt == 111, "expiry");
        require(r.seq == 1, "seq");
        require(!r.released, "released");
        require(reg.seqOf(_nh("alice.dial")) == 1, "seqOf");
    }

    function testNonOwnerReverts() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(DialRegistry.NotOwner.selector);
        reg.setRecord("alice.dial", alice, 1, attHash, addrHash, 1);
    }

    function testSeqMustBeMonotonic() public {
        vm.prank(owner);
        reg.setRecord("alice.dial", alice, 1, attHash, addrHash, 1);
        // replaying seq 1 (expected 2) reverts
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DialRegistry.BadSeq.selector, uint64(2), uint64(1)));
        reg.setRecord("alice.dial", alice, 2, attHash, addrHash, 1);
        // skipping to seq 3 (expected 2) reverts
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DialRegistry.BadSeq.selector, uint64(2), uint64(3)));
        reg.setRecord("alice.dial", alice, 2, attHash, addrHash, 3);
        // correct next seq applies
        vm.prank(owner);
        reg.setRecord("alice.dial", alice, 2, attHash, addrHash, 2);
        require(reg.seqOf(_nh("alice.dial")) == 2, "seq advanced");
    }

    function testReleaseIsTerminal() public {
        vm.prank(owner);
        reg.setRecord("bob.dial", alice, 1, attHash, addrHash, 1);
        vm.prank(owner);
        reg.release("bob.dial", 2);
        require(reg.getRecord(_nh("bob.dial")).released, "released flag");
        // any further write reverts
        vm.prank(owner);
        vm.expectRevert(DialRegistry.AlreadyReleased.selector);
        reg.setRecord("bob.dial", alice, 1, attHash, addrHash, 3);
    }

    function testSignedRevertsWhenSignerUnset() public {
        vm.expectRevert(DialRegistry.SignerNotSet.selector);
        reg.setRecordSigned(_nh("x.dial"), alice, 1, attHash, addrHash, 1, false, hex"00");
    }

    function testSignedWriteWithDialSigner() public {
        uint256 pk = 0xA11CE5; // throwaway signer key
        address signer = vm.addr(pk);
        vm.prank(owner);
        reg.setDialSigner(signer);

        bytes32 nh = _nh("signed.dial");
        bytes32 digest = reg.hashRecord(nh, alice, 222, attHash, addrHash, 1, false);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // anyone (not owner) can relay a validly-signed record
        vm.prank(address(0xCAFE));
        reg.setRecordSigned(nh, alice, 222, attHash, addrHash, 1, false, sig);
        require(reg.getRecord(nh).expiresAt == 222, "applied");

        // a tampered field breaks the signature
        vm.expectRevert(DialRegistry.BadSignature.selector);
        reg.setRecordSigned(nh, alice, 999, attHash, addrHash, 2, false, sig);
    }

    // ── consumer-controlled addresses (decentralisation) ──
    uint256 constant CK = 0xC0FFEE;          // consumer key
    function _signAddrs(uint256 pk, bytes32 nh, bytes32 ah, uint64 seq, uint256 deadline) internal view returns (bytes memory) {
        bytes32 digest = reg.hashSetAddresses(nh, ah, seq, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
    function _bootstrap(string memory name, address consumer) internal returns (bytes32) {
        vm.prank(owner); reg.setRecord(name, alice, 100, attHash, addrHash, 1);
        vm.prank(owner); reg.setController(name, consumer);
        return _nh(name);
    }

    function testConsumerSetsOwnAddresses() public {
        bytes32 nh = _bootstrap("alice.dial", vm.addr(CK));
        bytes32 newAddrs = keccak256("consumer-addrs");
        bytes memory sig = _signAddrs(CK, nh, newAddrs, 2, type(uint256).max);
        vm.prank(address(0xBEEF)); // relaying is permissionless (DIAL, or anyone)
        reg.setAddressesSigned(nh, newAddrs, 2, type(uint256).max, sig);
        require(reg.getRecord(nh).addressesHash == newAddrs, "consumer set addresses");
    }

    // The decisive property: once a consumer controls a name, DIAL keeps issuance
    // (can renew) but CANNOT change the address.
    function testDialCannotChangeConsumerAddresses() public {
        bytes32 nh = _bootstrap("alice.dial", vm.addr(CK));
        bytes32 consumerAddrs = keccak256("consumer-addrs");
        reg.setAddressesSigned(nh, consumerAddrs, 2, type(uint256).max, _signAddrs(CK, nh, consumerAddrs, 2, type(uint256).max));
        // DIAL tries to overwrite addresses via setRecord with a different hash
        vm.prank(owner); reg.setRecord("alice.dial", alice, 200, attHash, keccak256("dial-forge-attempt"), 3);
        DialRegistry.Record memory r = reg.getRecord(nh);
        require(r.expiresAt == 200, "DIAL can still renew (issuance)");
        require(r.addressesHash == consumerAddrs, "DIAL CANNOT change consumer addresses");
    }

    function testAddrSignedRejectsWrongSigner() public {
        bytes32 nh = _bootstrap("alice.dial", vm.addr(CK));
        bytes32 ah = keccak256("x");
        bytes memory badSig = _signAddrs(0xBADBAD, nh, ah, 2, type(uint256).max); // sign with a non-controller key
        vm.expectRevert(DialRegistry.BadSignature.selector);
        reg.setAddressesSigned(nh, ah, 2, type(uint256).max, badSig);
    }

    function testAddrSignedRequiresController() public {
        vm.prank(owner); reg.setRecord("acme.dial", alice, 100, attHash, addrHash, 1); // DIAL-managed, no controller
        bytes32 nh = _nh("acme.dial");
        bytes32 ah = keccak256("x");
        bytes memory sig = _signAddrs(CK, nh, ah, 2, type(uint256).max);
        vm.expectRevert(DialRegistry.NoController.selector);
        reg.setAddressesSigned(nh, ah, 2, type(uint256).max, sig);
    }
}
