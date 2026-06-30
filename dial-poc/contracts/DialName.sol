// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDialController { function controllerOf(bytes32 nameHash) external view returns (address); }

/// @title DialName — DIAL names as ERC-721 NFTs, held in the owner's wallet.
/// @notice DIAL mints a name to a consumer's wallet when that wallet takes
/// on-chain control of it. tokenId = uint256(keccak256(name)). Once minted, the
/// holder owns it: they can transfer it, and it persists in their wallet
/// independently of DIAL's database. DIAL (the minter) cannot move a token that
/// is already held by someone else.
contract DialName {
    string public constant name = "DIAL Names";
    string public constant symbol = "DIAL";
    address public owner;    // DIAL minter (legacy owner-relayer path)
    address public registry; // DialRegistry — source of truth for who controls a name (self-mint path)

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approved;
    mapping(address => mapping(address => bool)) private _operators;
    mapping(uint256 => string) public nameOf; // tokenId => dial name

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    error NotMinter();
    error NotAuthorized();
    error AlreadyOwned();
    error ZeroAddress();
    error NoToken();
    error NotController();

    modifier onlyMinter() { if (msg.sender != owner) revert NotMinter(); _; }
    constructor(address minter, address registry_) { owner = minter; registry = registry_; }

    function tokenIdFor(string calldata dialName) external pure returns (uint256) { return uint256(keccak256(bytes(dialName))); }

    function balanceOf(address a) external view returns (uint256) { if (a == address(0)) revert ZeroAddress(); return _balances[a]; }
    function ownerOf(uint256 id) public view returns (address) { address o = _owners[id]; if (o == address(0)) revert NoToken(); return o; }

    /// @notice Mint a name to `to`. No-op if `to` already holds it; reverts if it
    /// is already held by a DIFFERENT address (DIAL can't seize a held name).
    function mint(string calldata dialName, address to) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        uint256 id = uint256(keccak256(bytes(dialName)));
        address prev = _owners[id];
        if (prev == to) return;
        if (prev != address(0)) revert AlreadyOwned();
        _owners[id] = to; _balances[to] += 1; nameOf[id] = dialName;
        emit Transfer(address(0), to, id);
    }

    /// @notice Self-mint: the name's on-chain controller (per DialRegistry) mints its
    /// OWN token and pays the gas. No minter privilege needed — the registry is the
    /// authority. No-op if already held by the caller; reverts if held by another.
    function claim(string calldata dialName) external returns (uint256) {
        uint256 id = uint256(keccak256(bytes(dialName)));
        if (IDialController(registry).controllerOf(bytes32(id)) != msg.sender) revert NotController();
        address prev = _owners[id];
        if (prev == msg.sender) return id;
        if (prev != address(0)) revert AlreadyOwned();
        _owners[id] = msg.sender; _balances[msg.sender] += 1; nameOf[id] = dialName;
        emit Transfer(address(0), msg.sender, id);
        return id;
    }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        if (msg.sender != o && !_operators[o][msg.sender]) revert NotAuthorized();
        _approved[id] = to; emit Approval(o, to, id);
    }
    function getApproved(uint256 id) external view returns (address) { ownerOf(id); return _approved[id]; }
    function setApprovalForAll(address op, bool ok) external { _operators[msg.sender][op] = ok; emit ApprovalForAll(msg.sender, op, ok); }
    function isApprovedForAll(address o, address op) external view returns (bool) { return _operators[o][op]; }

    function transferFrom(address from, address to, uint256 id) public {
        if (ownerOf(id) != from) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != from && _approved[id] != msg.sender && !_operators[from][msg.sender]) revert NotAuthorized();
        _approved[id] = address(0); _balances[from] -= 1; _balances[to] += 1; _owners[id] = to;
        emit Transfer(from, to, id);
    }
    function safeTransferFrom(address from, address to, uint256 id) external { transferFrom(from, to, id); }
    function safeTransferFrom(address from, address to, uint256 id, bytes calldata) external { transferFrom(from, to, id); }

    function tokenURI(uint256 id) external view returns (string memory) {
        string memory n = nameOf[id];
        if (bytes(n).length == 0) revert NoToken();
        // Render an on-chain SVG card with the NAME, and base64-encode both the
        // image and the JSON — the data-URI format wallets/explorers actually parse
        // (the old `;utf8,` variant fell back to "DIAL Names #<tokenId>").
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">',
            '<rect width="500" height="500" fill="#0b1020"/>',
            '<text x="50%" y="47%" fill="#ffffff" font-size="30" font-weight="bold" font-family="monospace" text-anchor="middle">', n, '</text>',
            '<text x="50%" y="57%" fill="#6b8cff" font-size="15" font-family="sans-serif" text-anchor="middle">DIAL name - owned on-chain</text>',
            '</svg>'
        ));
        string memory json = string(abi.encodePacked(
            '{"name":"', n, '","description":"A DIAL name, owned on-chain.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"namespace","value":"DIAL"}]}'
        ));
        return string(abi.encodePacked('data:application/json;base64,', Base64.encode(bytes(json))));
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0x80ac58cd || iid == 0x5b5e139f || iid == 0x01ffc9a7; // ERC721, Metadata, ERC165
    }
}

/// @dev Minimal Base64 encoder (Brecht Devos / MIT) — for on-chain data-URI metadata.
library Base64 {
    string internal constant _TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function encode(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "";
        string memory table = _TABLE;
        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        string memory result = new string(encodedLen + 32);
        assembly {
            mstore(result, encodedLen)
            let tablePtr := add(table, 1)
            let dataPtr := data
            let endPtr := add(dataPtr, mload(data))
            let resultPtr := add(result, 32)
            for {} lt(dataPtr, endPtr) {} {
                dataPtr := add(dataPtr, 3)
                let input := mload(dataPtr)
                mstore8(resultPtr, mload(add(tablePtr, and(shr(18, input), 0x3F)))) resultPtr := add(resultPtr, 1)
                mstore8(resultPtr, mload(add(tablePtr, and(shr(12, input), 0x3F)))) resultPtr := add(resultPtr, 1)
                mstore8(resultPtr, mload(add(tablePtr, and(shr(6, input), 0x3F)))) resultPtr := add(resultPtr, 1)
                mstore8(resultPtr, mload(add(tablePtr, and(input, 0x3F)))) resultPtr := add(resultPtr, 1)
            }
            switch mod(mload(data), 3)
            case 1 { mstore8(sub(resultPtr, 1), 0x3d) mstore8(sub(resultPtr, 2), 0x3d) }
            case 2 { mstore8(sub(resultPtr, 1), 0x3d) }
        }
        return result;
    }
}
