// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DialName} from "../contracts/DialName.sol";

interface Vm { function prank(address) external; function expectRevert(bytes4) external; }

// Stand-in for DialRegistry's controllerOf lookup (self-mint authority).
contract MockController {
    mapping(bytes32 => address) public controllerOf;
    function set(bytes32 nh, address c) external { controllerOf[nh] = c; }
}

contract DialNameTest {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    DialName nft;
    MockController reg;
    address minter = address(0xD1A1);
    address alice  = address(0xA11CE);
    address bob    = address(0xB0B);

    function setUp() public { reg = new MockController(); nft = new DialName(minter, address(reg)); }
    function _id(string memory n) internal pure returns (uint256) { return uint256(keccak256(bytes(n))); }

    function testMintAndOwn() public {
        vm.prank(minter);
        nft.mint("alice.dial", alice);
        require(nft.ownerOf(_id("alice.dial")) == alice, "owner");
        require(nft.balanceOf(alice) == 1, "balance");
        require(keccak256(bytes(nft.nameOf(_id("alice.dial")))) == keccak256(bytes("alice.dial")), "nameOf");
    }

    function testMintIsIdempotentToSameOwner() public {
        vm.prank(minter); nft.mint("alice.dial", alice);
        vm.prank(minter); nft.mint("alice.dial", alice); // no-op
        require(nft.balanceOf(alice) == 1, "no double-mint");
    }

    function testMinterCannotSeizeHeldName() public {
        vm.prank(minter); nft.mint("alice.dial", alice);
        vm.prank(minter);
        vm.expectRevert(DialName.AlreadyOwned.selector);
        nft.mint("alice.dial", bob); // DIAL cannot move a held token
    }

    function testHolderCanTransfer() public {
        vm.prank(minter); nft.mint("alice.dial", alice);
        vm.prank(alice); nft.transferFrom(alice, bob, _id("alice.dial"));
        require(nft.ownerOf(_id("alice.dial")) == bob, "transferred");
    }

    function testOnlyMinterMints() public {
        vm.prank(alice);
        vm.expectRevert(DialName.NotMinter.selector);
        nft.mint("x.dial", alice);
    }

    function testSupportsErc721() public view {
        require(nft.supportsInterface(0x80ac58cd), "ERC721");
        require(nft.supportsInterface(0x5b5e139f), "Metadata");
    }

    // ── self-custody: the name's on-chain controller mints its own token + pays gas ──
    function testControllerSelfMints() public {
        reg.set(bytes32(_id("alice.dial")), alice);
        vm.prank(alice);
        nft.claim("alice.dial");
        require(nft.ownerOf(_id("alice.dial")) == alice, "self-minted to controller");
        require(nft.balanceOf(alice) == 1, "balance");
    }

    function testClaimRejectsNonController() public {
        reg.set(bytes32(_id("alice.dial")), alice);
        vm.prank(bob); // not the registry's controller
        vm.expectRevert(DialName.NotController.selector);
        nft.claim("alice.dial");
    }

    // tokenURI must be a base64 JSON data-URI (parseable by wallets/explorers) —
    // the old `;utf8,` form made them show "DIAL Names #<tokenId>".
    function testTokenUriIsBase64Json() public {
        reg.set(bytes32(_id("alice.dial")), alice);
        vm.prank(alice); nft.claim("alice.dial");
        bytes memory u = bytes(nft.tokenURI(_id("alice.dial")));
        bytes memory pfx = bytes("data:application/json;base64,");
        require(u.length > pfx.length, "uri too short");
        for (uint256 i = 0; i < pfx.length; i++) require(u[i] == pfx[i], "bad prefix");
    }
}
