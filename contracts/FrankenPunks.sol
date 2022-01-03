// SPDX-License-Identifier: MIT

/**
 _______  _______  _______  _        _        _______  _          _______           _        _        _______
(  ____ \(  ____ )(  ___  )( (    /|| \    /\(  ____ \( (    /|  (  ____ )|\     /|( (    /|| \    /\(  ____ \
| (    \/| (    )|| (   ) ||  \  ( ||  \  / /| (    \/|  \  ( |  | (    )|| )   ( ||  \  ( ||  \  / /| (    \/
| (__    | (____)|| (___) ||   \ | ||  (_/ / | (__    |   \ | |  | (____)|| |   | ||   \ | ||  (_/ / | (_____
|  __)   |     __)|  ___  || (\ \) ||   _ (  |  __)   | (\ \) |  |  _____)| |   | || (\ \) ||   _ (  (_____  )
| (      | (\ (   | (   ) || | \   ||  ( \ \ | (      | | \   |  | (      | |   | || | \   ||  ( \ \       ) |
| )      | ) \ \__| )   ( || )  \  ||  /  \ \| (____/\| )  \  |  | )      | (___) || )  \  ||  /  \ \/\____) |
|/       |/   \__/|/     \||/    )_)|_/    \/(_______/|/    )_)  |/       (_______)|/    )_)|_/    \/\_______)

*/

pragma solidity ^0.8.9;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { ERC721EnumerableOptimized } from "./lib/ERC721EnumerableOptimized.sol";

/**
 * @title FrankenPunks contract.
 *
 * @notice Implements a fair and random NFT distribution, based on the Hashmasks/BAYC model.
 *
 *  Additional features include:
 *   - Merkle-tree whitelist
 *   - Dutch-auction pricing
 *   - On-chain support for a pre-reveal placeholder image
 */
contract FrankenPunks is ERC721Enumerable, Ownable {
    using Strings for uint256;

    event PresaleMerkleTreeUpdated(bytes32 root, bytes32 ipfsHash);
    event ProvenanceHashUpdated(string provenanceHash);
    event IsRevealedUpdated(bool isRevealed);
    event BaseURIUpdated(string baseURI);
    event ContractURIUpdated(string contractURI);
    event Finalized();
    event Withdrew(uint256 balance);
    event SetStartingIndexBlockNumber(uint256 blockNumber, bool usedForce);
    event SetStartingIndex(uint256 startingIndex, uint256 blockNumber);

    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public constant RESERVED_SUPPLY = 88;
    uint256 public constant MINT_PRICE_START = 0.5 ether;
    uint256 public constant MINT_PRICE_END = 0.088 ether;
    string public constant TOKEN_URI_EXTENSION = ".json";

    /// @notice Hash which commits to the content, metadata, and original sequence of the NFTs.
    string public _provenanceHash;

    /// @notice The block number to be used to derive the starting index.
    uint256 public _startingIndexBlockNumber;

    /// @notice The starting index, chosen pseudorandomly to ensure a fair and random distribution.
    uint256 public _startingIndex;

    /// @notice Whether the starting index was set.
    bool public _startingIndexWasSet;

    bool public _presaleIsActive = false;
    bool public _saleIsActive = false;
    bool public _isRevealed = false;
    bool public _isFinalized = false;

    /// @notice The root of the Merkle tree with addresses allowed to mint in the presale.
    bytes32 _presaleMerkleRoot;

    mapping(address => uint256) public _numPresaleMints;

    string internal _baseTokenURI;
    string internal _placeholderURI;
    string internal _contractURI;

    modifier notFinalized() {
        require(
            !_isFinalized,
            "Metadata is finalized"
        );
        _;
    }

    constructor(
        string memory placeholderURI
    ) ERC721("FrankenPunks", "FP") {
        _placeholderURI = placeholderURI;
    }

    function setPresaleMerkleRoot(bytes32 root, bytes32 ipfsHash) external onlyOwner {
        _presaleMerkleRoot = root;
        emit PresaleMerkleTreeUpdated(root, ipfsHash);
    }

    function setProvenanceHash(string calldata provenanceHash) external onlyOwner notFinalized {
        _provenanceHash = provenanceHash;
        emit ProvenanceHashUpdated(provenanceHash);
    }

    function setPresaleIsActive(bool presaleIsActive) external onlyOwner {
        _presaleIsActive = presaleIsActive;
    }

    function setSaleIsActive(bool saleIsActive) external onlyOwner {
        _saleIsActive = saleIsActive;
    }

    function setIsRevealed(bool isRevealed) external onlyOwner notFinalized {
        _isRevealed = isRevealed;
        emit IsRevealedUpdated(isRevealed);
    }

    function setBaseURI(string calldata baseTokenURI) external onlyOwner notFinalized {
        _baseTokenURI = baseTokenURI;
        emit BaseURIUpdated(baseTokenURI);
    }

    function setPlaceholderURI(string calldata placeholderURI) external onlyOwner {
        _placeholderURI = placeholderURI;
    }

    function setContractURI(string calldata newContractURI) external onlyOwner {
        _contractURI = newContractURI;
        emit ContractURIUpdated(newContractURI);
    }

    function finalize() external onlyOwner notFinalized {
        require(
            _isRevealed,
            "Must be revealed to finalize"
        );
        _isFinalized = true;
        emit Finalized();
    }

    function mintReservedTokens(uint256 numToMint) external onlyOwner {
        uint256 startingSupply = totalSupply();

        require(
            startingSupply + numToMint <= RESERVED_SUPPLY,
            "Mint would exceed reserved supply"
        );

        // Note: First token has ID #0.
        for (uint256 i = 0; i < numToMint; i++) {
            // Note: Skip the _safeMint() logic and use regular _mint() for reserved tokens.
            _mint(msg.sender, startingSupply + i);
        }
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        payable(msg.sender).transfer(balance);
        emit Withdrew(balance);
    }

    /**
     * @notice Called by users to mint from the presale.
     */
    function mintPresale(
        uint256 numToMint,
        uint256 maxMints,
        bytes32[] calldata merkleProof
    ) external payable {
        require(
            _presaleIsActive,
            "Presale not active"
        );
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, maxMints));
        require(
            MerkleProof.verify(merkleProof, _presaleMerkleRoot, leaf),
            "Invalid Merkle proof"
        );

        // Require that the minter does not exceed their max allocation given by the Merkle tree.
        uint256 newNumPresaleMints = _numPresaleMints[msg.sender] + numToMint;
        require(
            newNumPresaleMints <= maxMints,
            "Presale mints exceeded"
        );

        // Update storage and do the mint.
        _numPresaleMints[msg.sender] = newNumPresaleMints;
        _mintInner(numToMint);
    }

    /**
     * @notice Called by users to mint from the main sale.
     */
    function mint(uint256 numToMint) external payable {
        require(
            _saleIsActive,
            "Sale not active"
        );
        _mintInner(numToMint);
    }

    /**
    * @notice Fix the starting index using the previously determined block number.
    */
    function setStartingIndex() external {
        require(
            !_startingIndexWasSet,
            "Starting index was set"
        );

        uint256 targetBlock = _startingIndexBlockNumber;

        require(
            targetBlock != 0,
            "Block number not set"
        );

        // If the hash for the desired block is unavailable, fall back to the most recent block.
        if (block.number - targetBlock > 256) {
            targetBlock = block.number - 1;
        }

        uint256 startingIndex = uint256(blockhash(targetBlock)) % MAX_SUPPLY;
        _startingIndex = startingIndex;
        _startingIndexWasSet = true;
        emit SetStartingIndex(startingIndex, targetBlock);
    }

    function fallbackSetStartingIndexBlockNumber()
        external
        onlyOwner
    {
        require(
            _startingIndexBlockNumber == 0,
            "Block number was set"
        );
        _setStartingIndexBlockNumber(true);
    }

    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(
            _exists(tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );

        if (!_isRevealed) {
            return _placeholderURI;
        }

        string memory baseURI = _baseTokenURI;
        return bytes(baseURI).length > 0
            ? string(abi.encodePacked(baseURI, tokenId.toString(), TOKEN_URI_EXTENSION))
            : "";
    }

    function getCost(uint256 numToMint) public view returns (uint256) {
        // TODO: dutch auction
        return numToMint * MINT_PRICE_END;
    }

    /**
     * @dev Mints `numToMint` tokens to msg.sender.
     *
     *  Reverts if the max supply would be exceeded.
     *  Reverts if the payment amount (`msg.value`) is insufficient.
     */
    function _mintInner(uint256 numToMint) internal {
        uint256 startingSupply = totalSupply();

        require(
            startingSupply + numToMint <= MAX_SUPPLY,
            "Mint would exceed max supply"
        );
        require(
            getCost(numToMint) <= msg.value,
            "Insufficient payment"
        );

        // Note: First token has ID #0.
        for (uint256 i = 0; i < numToMint; i++) {
            _safeMint(msg.sender, startingSupply + i);
        }

        // Finalize the starting index block number when the last token is purchased.
        if (startingSupply + numToMint == MAX_SUPPLY) {
            _setStartingIndexBlockNumber(false);
        }
    }

    function _setStartingIndexBlockNumber(bool usedForce) internal {
        // Add one to make it even harder to manipulate.
        // Ref: https://github.com/the-torn/floot#floot-seed-generation
        uint256 blockNumber = block.number + 1;
        _startingIndexBlockNumber = blockNumber;
        emit SetStartingIndexBlockNumber(blockNumber, usedForce);
    }
}
