// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DialName} from "../contracts/DialName.sol";

interface Vm { function prank(address) external; function expectRevert(bytes4) external; }

contract DialNameTest {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    DialName nft;
    address minter = address(0xD1A1);
    address alice  = address(0xA11CE);
    address bob    = address(0xB0B);

    function setUp() public { nft = new DialName(minter); }
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
}
