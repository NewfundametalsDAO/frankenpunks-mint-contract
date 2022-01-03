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

/**
*/

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./ERC721Enumerable.sol";
import "./Ownable.sol";
import "./Strings.sol";

/**
 * @title ERC-721 Smart Contract
 */

/**
 * @title FrankenPunks contract
 * @dev Extends ERC721 Non-Fungible Token Standard basic implementation
 */
contract FrankenPunks is ERC721, Ownable {
    using Strings for uint256;

    string public PROVENANCE = "";

    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public constant MAX_RESERVE_SUPPLY = 88;
    uint256 public constant TOKEN_PRICE = 88000000000000000;

    uint256 public maxMints = 3;
    uint256 public presaleMaxMints = 3;

    bool public saleIsActive = false;
    bool public presaleIsActive = false;
    bool public revealed = false;

    mapping(address => bool) private presaleList;
    mapping(address => uint256) private numOfMintsPurchased;

    string baseURI;
    string private notRevealedUri;
    string public baseExtension = ".json";


    constructor(
        string memory _initNotRevealedUri
        ) ERC721("FrankenPunks", "FP") {
          setNotRevealedURI(_initNotRevealedUri);
    }

    function setMaxMints(uint256 _maxMints) external onlyOwner {
        maxMints = _maxMints
    }

    function setPresaleMaxMints(uint256 _presaleMaxMints) external onlyOwner {
        require(_presaleMaxMints <= maxMints, "Presale max mints must be less than or equal to total max mints allowed");

        presaleMaxMint = _presaleMaxMint;
    }

    function setPresaleState(bool _presaleState) external onlyOwner {
        presaleActive = _presaleState;
    }

    function flipPresaleState() external onlyOwner {
        presaleActive = !presaleActive;
    }

    function setSaleState(bool _saleState) external onlyOwner {
        saleIsActive = _saleState;
    }

    function flipSaleState() external onlyOwner {
        saleIsActive = !saleIsActive;
    }

    function addToPresaleList(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            presaleList[addresses[i]] = true;

            if (!presalePurchases[addresses[i]]) {
              presalePurchases[addresses[i]] = 0;
            }
        }
    }

    function removeFromPresaleList(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            if (isOnPresaleList(addresses[i])) {
                presaleList[addresses[i]] = false;
            }
        }
    }

    function isOnPresaleList(address addr) external view returns (bool) {
        return presaleList[addr];
    }

    function mintPurchasesLeft(address addr) external view returns (uint256) {
      return maxMints - numOfMintsPurchased[addr];
    }

    function presalePurchasesLeft(address addr) external view returns (uint256) {
        if (isOnPresaleList(addr)) {
            return presaleMaxMints - numOfMintsPurchased[addr];
        }

        return 0;
    }

    function canAffordPurchase(uint256 _amountToMint, uint256 value) external view returns (bool) {
        return value === TOKEN_PRICE * _amountToMint;
    }

    function doesNotExceedSupply(unit256 _amountToMint) external view returns (bool) {
        uint256 supply = totalSupply();

        return supply + _amountToMint <= MAX_SUPPLY;
    }

    function mintPresale(uint256 _amountToMint) public payable {
        require(presaleActive, "Presale must be active to mint");
        require(isOnPresaleList([msg.sender]), "Is not on the presale list");
        require(_amountToMint <= presalePurchasesLeft(msg.sender), "The amount to mint exceeds the presale maximum");
        require(canAffordPurchase(_amountToMint, msg.value), "Cannot afford to do this minting");
        require(doesNotExceedSupply(_amountToMint), "This minting must not surpass maximum supply");

        uint256 currentSupply = totalSupply();

        for (uint256 i = 1; i <= _amountToMint; i++) {
            numOfMintsPurchased[msg.sender] += 1;
            _safeMint(msg.sender, currentSupply + i);
        }
    }

    function mint(uint256 _amountToMint) public payable {
        require(saleIsActive, "Sale must be active to mint");
        require(_amountToMint <= mintPurchasesLeft(msg.sender), "Exceeds maximum minting allowed");
        require(doesNotExceedSupply(_amountToMint), "This minting must not surpass maximum supply");
        require(canAffordPurchase(_amountToMint, msg.value), "Cannot afford to do this minting");

        uint256 currentSupply = totalSupply();

        for (uint256 i = 1; i <= _amountToMint; i++) {
           numOfMintsPurchased[msg.sender] += 1;
            _safeMint(msg.sender, currentSupply + i);
        }
    }

    // CHANGED: added to account for changes in openzeppelin versions


    // CHANGED: added to account for changes in openzeppelin versions
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(
            _exists(tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );

        if(revealed == false) {
            return notRevealedUri;
        }

        string memory currentBaseURI = _baseURI();
        return bytes(currentBaseURI).length > 0
        ? string(abi.encodePacked(currentBaseURI, tokenId.toString(), baseExtension))
        : "";
    }

    function setProvenance(string memory provenance) public onlyOwner {
        PROVENANCE = provenance;
    }

    function reveal() public onlyOwner() {
        revealed = true;
    }

    function setNotRevealedURI(string memory _notRevealedURI) public onlyOwner {
        notRevealedUri = _notRevealedURI;
    }

    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }

    function reserveTokens() public onlyOwner {
        require(doesNotExceedSupply(MAX_RESERVE_SUPPLY), "This minting must not surpass maximum supply");

        uint256 currentSupply = totalSupply();

        for (uint256 i = 1; i <= MAX_RESERVE_SUPPLY; i++) {
            _safeMint(msg.sender, currentSupply + i);
        }
    }

    function withdraw() public onlyOwner {
        uint balance = address(this).balance;
        payable(msg.sender).transfer(balance);
    }

}
