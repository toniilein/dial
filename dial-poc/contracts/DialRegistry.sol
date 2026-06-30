// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DialRegistry — on-chain mirror of DIAL name records.
/// @notice v1 runs in "owner-relayer" mode: the DIAL backend EOA is `owner` and
/// the sole writer via setRecord/release — the transaction itself is the
/// authorization ("DIAL said so"). This is a tamper-evident, ordered COMMITMENT,
/// not yet an independently-verifiable record.
///
/// EIP-712 rails (hashRecord + setRecordSigned + dialSigner) ship dormant: while
/// `dialSigner == address(0)`, setRecordSigned reverts. Setting a DIAL signer
/// later turns on writes that ANY relayer can submit and anyone can verify
/// against that signer — no redeploy, no storage-layout change.
contract DialRegistry {
    struct Record {
        address owner;          // DIAL owner identity (see evm.ts owner mapping)
        uint64  expiresAt;      // DIAL expiry, milliseconds (mirrors DB; never compared to block.timestamp)
        bytes32 attestationHash;
        bytes32 addressesHash;  // keccak commitment to the off-chain addr.* map
        uint64  seq;            // per-name monotonic version
        bool    released;       // terminal tombstone
        uint64  updatedAt;      // block timestamp of the write (seconds)
    }

    mapping(bytes32 => Record) private _records; // nameHash => latest record
    mapping(bytes32 => uint64) public seqOf;     // nameHash => last applied seq
    // The wallet a consumer controls their OWN addresses with (0 = DIAL-managed).
    // Once set, only this wallet can change the name's addresses — not DIAL.
    mapping(bytes32 => address) public controllerOf;
    address public owner;                        // DIAL relayer EOA (issuance authority)
    address public dialSigner;                   // 0x0 until the global Layer-2 path is enabled

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RECORD_TYPEHASH =
        keccak256("DialRecord(bytes32 nameHash,address owner,uint64 expiresAt,bytes32 attestationHash,bytes32 addressesHash,uint64 seq,bool released)");
    // Consumer-signed address update (relayed by anyone; verified against controllerOf).
    bytes32 private constant SETADDR_TYPEHASH =
        keccak256("SetAddresses(bytes32 nameHash,bytes32 addressesHash,uint64 seq,uint256 deadline)");

    event RecordSet(bytes32 indexed nameHash, address indexed owner, uint64 expiresAt, uint64 seq, bytes32 addressesHash);
    event RecordReleased(bytes32 indexed nameHash, uint64 seq);
    event DialSignerChanged(address indexed signer);
    event OwnershipTransferred(address indexed from, address indexed to);
    event ControllerSet(bytes32 indexed nameHash, address indexed controller);
    event AddressesSet(bytes32 indexed nameHash, bytes32 addressesHash, uint64 seq, address indexed by);

    error NotOwner();
    error BadSeq(uint64 expected, uint64 got);
    error AlreadyReleased();
    error SignerNotSet();
    error BadSignature();
    error NoController();
    error Expired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH, keccak256(bytes("DIAL")), keccak256(bytes("1")), block.chainid, address(this)
        ));
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ── admin ──
    function transferOwnership(address to) external onlyOwner {
        emit OwnershipTransferred(owner, to);
        owner = to;
    }
    function setDialSigner(address signer) external onlyOwner {
        dialSigner = signer;
        emit DialSignerChanged(signer);
    }

    // DIAL hands address-control of a name to a consumer wallet (bootstrapped from
    // the SIWE wallet-link). Pass address(0) to revert it to DIAL-managed.
    function setController(string calldata name, address controller) external onlyOwner {
        bytes32 nameHash = keccak256(bytes(name));
        controllerOf[nameHash] = controller;
        emit ControllerSet(nameHash, controller);
    }

    function getRecord(bytes32 nameHash) external view returns (Record memory) {
        return _records[nameHash];
    }

    // ── DIAL issuance — owner-relayer writes owner/expiry/attestation ──
    // NOTE: if a consumer controls this name, DIAL CANNOT change its addresses —
    // the stored addressesHash is preserved and only setAddressesSigned (the
    // consumer's signature) can move it. DIAL keeps the namespace; the consumer
    // owns their address.
    function setRecord(
        string calldata name, address owner_, uint64 expiresAt,
        bytes32 attestationHash, bytes32 addressesHash, uint64 seq
    ) external onlyOwner {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 addrHash = controllerOf[nameHash] == address(0)
            ? addressesHash
            : _records[nameHash].addressesHash; // consumer-controlled → leave addresses untouched
        _apply(nameHash, owner_, expiresAt, attestationHash, addrHash, seq, false);
    }

    // ── Consumer-controlled addresses — signed by the controller, relayed by anyone ──
    // The decentralisation step: a consumer's on-chain address can only change with
    // a signature from their own wallet. DIAL (or anyone) may submit the tx and pay
    // the gas, but cannot forge the binding.
    function setAddressesSigned(
        bytes32 nameHash, bytes32 addressesHash, uint64 seq, uint256 deadline, bytes calldata signature
    ) external {
        address ctrl = controllerOf[nameHash];
        if (ctrl == address(0)) revert NoController();
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = hashSetAddresses(nameHash, addressesHash, seq, deadline);
        if (_recover(digest, signature) != ctrl) revert BadSignature();
        Record storage r = _records[nameHash];
        _apply(nameHash, r.owner, r.expiresAt, r.attestationHash, addressesHash, seq, r.released);
        emit AddressesSet(nameHash, addressesHash, seq, ctrl);
    }

    function hashSetAddresses(bytes32 nameHash, bytes32 addressesHash, uint64 seq, uint256 deadline) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(SETADDR_TYPEHASH, nameHash, addressesHash, seq, deadline));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function release(string calldata name, uint64 seq) external onlyOwner {
        bytes32 nameHash = keccak256(bytes(name));
        Record storage r = _records[nameHash];
        _apply(nameHash, r.owner, r.expiresAt, r.attestationHash, r.addressesHash, seq, true);
    }

    // ── Layer 2 — anyone may relay a DIAL-signed record (dormant until signer set) ──
    function setRecordSigned(
        bytes32 nameHash, address owner_, uint64 expiresAt,
        bytes32 attestationHash, bytes32 addressesHash, uint64 seq, bool released,
        bytes calldata signature
    ) external {
        if (dialSigner == address(0)) revert SignerNotSet();
        bytes32 digest = hashRecord(nameHash, owner_, expiresAt, attestationHash, addressesHash, seq, released);
        if (_recover(digest, signature) != dialSigner) revert BadSignature();
        _apply(nameHash, owner_, expiresAt, attestationHash, addressesHash, seq, released);
    }

    function _apply(
        bytes32 nameHash, address owner_, uint64 expiresAt,
        bytes32 attestationHash, bytes32 addressesHash, uint64 seq, bool released
    ) internal {
        uint64 expected = seqOf[nameHash] + 1;
        if (seq != expected) revert BadSeq(expected, seq);
        if (_records[nameHash].released) revert AlreadyReleased();
        seqOf[nameHash] = seq;
        _records[nameHash] = Record(owner_, expiresAt, attestationHash, addressesHash, seq, released, uint64(block.timestamp));
        if (released) emit RecordReleased(nameHash, seq);
        else emit RecordSet(nameHash, owner_, expiresAt, seq, addressesHash);
    }

    /// @notice EIP-712 digest for a record — public so the off-chain (viem) signer
    /// can be proven byte-for-byte identical to the contract's hashing.
    function hashRecord(
        bytes32 nameHash, address owner_, uint64 expiresAt,
        bytes32 attestationHash, bytes32 addressesHash, uint64 seq, bool released
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            RECORD_TYPEHASH, nameHash, owner_, expiresAt, attestationHash, addressesHash, seq, released
        ));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
