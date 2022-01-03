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

    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public constant RESERVED_SUPPLY = 88;
    uint256 public constant MINT_PRICE_START = 0.5 ether;
    uint256 public constant MINT_PRICE_END = 0.088 ether;
    string public constant TOKEN_URI_EXTENSION = ".json";

    string public _provenanceHash = "";

    bool public _presaleIsActive = false;
    bool public _saleIsActive = false;
    bool public _isRevealed = false;

    mapping(address => uint256) public _numPresaleMints;

    string internal _baseTokenURI;
    string internal _placeholderURI;

    constructor(
        string memory placeholderURI
    ) ERC721("FrankenPunks", "FP") {
        _placeholderURI = placeholderURI;
    }

    function setProvenanceHash(string calldata provenanceHash) external onlyOwner {
        _provenanceHash = provenanceHash;
    }

    function setPresaleIsActive(bool presaleIsActive) external onlyOwner {
        _presaleIsActive = presaleIsActive;
    }

    function setSaleIsActive(bool saleIsActive) external onlyOwner {
        _saleIsActive = saleIsActive;
    }

    function setIsRevealed(bool isRevealed) external onlyOwner {
        _isRevealed = isRevealed;
    }

    function setBaseURI(string calldata baseTokenURI) external onlyOwner {
        _baseTokenURI = baseTokenURI;
    }

    function setPlaceholderURI(string calldata placeholderURI) external onlyOwner {
        _placeholderURI = placeholderURI;
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
    }

    /**
     * @notice Called by users to mint from the presale.
     */
    function mintPresale(uint256 numToMint) external payable {
        require(
            _presaleIsActive,
            "Presale not active"
        );
        // TODO: Check Merkle tree.
        _numPresaleMints[msg.sender] += numToMint;
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
    }
}
