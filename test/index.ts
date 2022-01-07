import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import {
  BigNumber,
  BigNumberish,
  ContractTransaction,
  Transaction,
  Wallet,
} from "ethers";
import { ethers } from "hardhat";
import _ from "lodash";

import merkleData from "../data/merkle.json";
import MerkleTree, { MerkleTreeLeaf } from "../src/merkleTree";
import { FrankenPunks } from "../typechain";
import {
  evmMine,
  evmRevert,
  evmSnapshot,
  impersonate,
  increaseTime,
} from "./util";
import {
  merkleTreeFromCompactData,
  RankInfo,
} from "../src/whitelist/loadWhitelist";
import { RANKS_FROM_WORST_TO_BEST } from "../src/constants";

// Test parameters.
const RUN_END_TO_END_LIFECYCLE_TEST = false;
const MAX_TREE_SIZE_TO_TEST = 9;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const MOCK_IPFS_HASH = ZERO_BYTES;
const MOCK_PROVENANCE_HASH = "mock-provenance-hash";
const PLACEHOLDER_URI = "https://example.com";

describe("FrankenPunks", function () {
  // EVM snapshot.
  let initSnapshot: string;

  // Contract instance.
  let contract: FrankenPunks;
  let contractAsUser: FrankenPunks;
  let contractAsOwner: FrankenPunks;

  // Accounts.
  let accounts: SignerWithAddress[];
  let addrs: string[];
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let owner: SignerWithAddress;

  // Prices.
  let presalePrice: BigNumber;
  let auctionPriceStart: BigNumber;
  let auctionPriceEnd: BigNumber;

  // Default Merkle tree to use for testing.
  let presaleTree: MerkleTree;

  before(async function () {
    accounts = await ethers.getSigners();
    [deployer, user, owner] = accounts;

    const factory = await ethers.getContractFactory("FrankenPunks");
    contract = await factory.deploy(owner.address, PLACEHOLDER_URI);
    contractAsUser = contract.connect(user);
    contractAsOwner = contract.connect(owner);
    await contract.deployed();

    addrs = accounts.map((a) => a.address);

    presalePrice = await contract.PRESALE_PRICE();
    auctionPriceStart = await contract.AUCTION_PRICE_START();
    auctionPriceEnd = await contract.AUCTION_PRICE_END();

    presaleTree = new MerkleTree([
      [addrs[0], 1, 0], // maxMints of 1, voucherAmount of 0
      [addrs[1], 3, presalePrice], // maxMints of 3, voucher of one token
    ]);

    // Take a snapshot of the initial contract state.
    initSnapshot = await evmSnapshot();
  });

  beforeEach(async () => {
    // Reset the contract state before each test case.
    await evmRevert(initSnapshot);
    initSnapshot = await evmSnapshot();
  });

  describe("owner functions", function () {
    it("setPresaleMerkleRoot", async function () {
      await contractAsOwner.setPresaleMerkleRoot(
        presaleTree.getRoot(),
        MOCK_IPFS_HASH
      );
    });

    it("setProvenanceHash", async function () {
      contractAsOwner.setProvenanceHash(MOCK_PROVENANCE_HASH);
    });

    it("setAuctionStartAndEnd", async function () {
      const start = (await ethers.provider.getBlock("latest")).timestamp;
      const end = start + 60; // 60 seconds
      await expect(contractAsOwner.setAuctionStartAndEnd(start, end))
        .to.emit(contract, "SetAuctionStartAndEnd")
        .withArgs(start, end);
    });

    it("setPresaleIsActive", async function () {
      await expect(contractAsOwner.setPresaleIsActive(true))
        .to.emit(contract, "SetPresaleIsActive")
        .withArgs(true);
    });

    it("setSaleIsActive", async function () {
      await expect(contractAsOwner.setSaleIsActive(false))
        .to.emit(contract, "SetSaleIsActive")
        .withArgs(false);
    });

    it("setIsRevealed", async function () {
      // Set up: mint a token.
      await contractAsOwner.mintReservedTokens(1);

      expect(await contract.tokenURI(0)).to.equal(PLACEHOLDER_URI);

      await expect(contractAsOwner.setIsRevealed(true))
        .to.emit(contract, "SetIsRevealed")
        .withArgs(true);

      expect(await contract.tokenURI(0)).to.equal("");

      await expect(contractAsOwner.setIsRevealed(false))
        .to.emit(contract, "SetIsRevealed")
        .withArgs(false);

      expect(await contract.tokenURI(0)).to.equal(PLACEHOLDER_URI);
    });

    it("setBaseURI", async function () {
      // Set up: mint a token and reveal token URIs.
      await contractAsOwner.mintReservedTokens(1);
      await expect(contractAsOwner.setIsRevealed(true));

      await contractAsOwner.setBaseURI("ipfs://mock-cid-1/");
      expect(await contract.tokenURI(0)).to.equal("ipfs://mock-cid-1/0.json");

      await contractAsOwner.setBaseURI("ipfs://mock-cid-2/");
      expect(await contract.tokenURI(0)).to.equal("ipfs://mock-cid-2/0.json");
    });

    it("setPlaceholderURI", async function () {
      // Set up: mint a token.
      await contractAsOwner.mintReservedTokens(1);

      const newPlaceholderURI = "ipfs://mock-cid-placeholder/";
      await contractAsOwner.setPlaceholderURI(newPlaceholderURI);
      expect(await contract.tokenURI(0)).to.equal(newPlaceholderURI);
    });

    it("setContractURI", async function () {
      const newContractURI = "ipfs://mock-cid-contract/";
      contractAsOwner.setContractURI(newContractURI);
      expect(await contract.contractURI()).to.equal(newContractURI);
    });

    it("finalize", async function () {
      // Must reveal before finalizing.
      await contractAsOwner.setIsRevealed(true);
      await expect(contractAsOwner.finalize())
        .to.emit(contract, "Finalized")
        .withArgs();
    });

    it("withdraw", async function () {
      await expect(contractAsOwner.withdraw())
        .to.emit(contract, "Withdrew")
        .withArgs(0);
    });

    it("mintReservedTokens", async function () {
      const reservedSupply = (await contract.RESERVED_SUPPLY()).toNumber();

      // Mint half of the reserved tokens.
      const expectToEmit1 = expect(
        contractAsOwner.mintReservedTokens(reservedSupply / 2)
      ).to.emit(contract, "Transfer");
      for (let i = 0; i < reservedSupply / 2; i++) {
        await expectToEmit1.withArgs(ZERO_ADDRESS, owner.address, i);
      }

      // Mint the other half of the reserved tokens.
      const expectToEmit2 = expect(
        contractAsOwner.mintReservedTokens(reservedSupply / 2)
      ).to.emit(contract, "Transfer");
      for (let i = reservedSupply / 2; i < reservedSupply; i++) {
        await expectToEmit2.withArgs(ZERO_ADDRESS, owner.address, i);
      }

      // Cannot mint any more.
      await expect(contractAsOwner.mintReservedTokens(1)).to.be.revertedWith(
        "Mint would exceed reserved supply"
      );
    });

    it("fallbackSetStartingIndexBlockNumber", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const latestBlockNumber = latestBlock.number;
      const targetBlock = latestBlockNumber + 2;
      await expect(contractAsOwner.fallbackSetStartingIndexBlockNumber())
        .to.emit(contract, "SetStartingIndexBlockNumber")
        .withArgs(targetBlock, true);
      expect(await contract._startingIndexBlockNumber()).to.equal(targetBlock);

      // Cannot call more than once.
      await expect(
        contractAsOwner.fallbackSetStartingIndexBlockNumber()
      ).to.be.revertedWith("Block number was set");

      await evmMine();
      const targetBlockHash = (await ethers.provider.getBlock(targetBlock))
        .hash;
      const maxSupply = await contract.MAX_SUPPLY();
      const expectedStartingIndex =
        BigNumber.from(targetBlockHash).mod(maxSupply);

      // Anyone can then set the starting index.
      await expect(contractAsUser.setStartingIndex())
        .to.emit(contract, "SetStartingIndex")
        .withArgs(expectedStartingIndex, targetBlock);
      expect(await contract._startingIndex()).to.equal(expectedStartingIndex);
    });
  });

  describe("presale minting", async function () {
    let leaves: MerkleTreeLeaf[];

    before(async function () {
      leaves = [
        [addrs[0], 1, 0],
        [addrs[1], 1, 0],
        [addrs[2], 1, 0],
        [addrs[3], 1, 0],
        [addrs[4], 2, 0],
        [addrs[5], 2, 0],
        [addrs[6], 3, 0],
        [addrs[7], 3, 0],
        [addrs[8], 3, 0],
        [addrs[9], 3, 0],
      ];
      if (leaves.length < MAX_TREE_SIZE_TO_TEST) {
        throw new Error("Invalid MAX_TREE_SIZE_TO_TEST");
      }
    });

    beforeEach(async function () {
      // Initial setup: activate the presale and use the default presale tree.
      await contractAsOwner.setPresaleIsActive(true);
      await contractAsOwner.setPresaleMerkleRoot(
        presaleTree.getRoot(),
        MOCK_IPFS_HASH
      );
    });

    it("successfully mints from the presale Merkle tree", async function () {
      await expect(
        // Use maxMints of 2 when the tree only has maxMints of 1.
        contract.mintPresale(1, 1, 0, presaleTree.getProof(addrs[0]), {
          value: presalePrice,
        })
      ).to.emit(contract, "Transfer");
      expect(await contract.totalSupply()).to.equal(1);
      await expectWithdrawBalance(presalePrice);
    });

    it("successfully mints from the presale using a voucher", async function () {
      const contractFromAccount1 = contract.connect(accounts[1]);
      const voucherAmount = presalePrice;
      await expect(
        // Use maxMints of 2 when the tree only has maxMints of 1.
        contractFromAccount1.mintPresale(
          3,
          3,
          voucherAmount,
          presaleTree.getProof(addrs[1]),
          {
            value: presalePrice.mul(3).sub(voucherAmount),
          }
        )
      ).to.emit(contract, "Transfer");
      expect(await contract.totalSupply()).to.equal(3);
      await expectWithdrawBalance(presalePrice.mul(2));
    });

    it("successfully mints in multiple transactions", async function () {
      // The maxMints for accounts[1] is 3.
      const contractFromAccount1 = contract.connect(accounts[1]);
      const voucherAmount = presalePrice;
      const proof = presaleTree.getProof(addrs[1]);
      for (let i = 0; i < 3; i++) {
        // First mint will user the voucher to mint for free.
        const value = i === 0 ? 0 : presalePrice;

        await expect(
          contractFromAccount1.mintPresale(1, 3, voucherAmount, proof, {
            value,
          })
        )
          .to.emit(contract, "Transfer")
          .withArgs(ZERO_ADDRESS, addrs[1], i);
      }
      expect(await contract.totalSupply()).to.equal(3);
      await expectWithdrawBalance(presalePrice.mul(2));
    });

    it("cannot mint if presale is not active", async function () {
      await contractAsOwner.setPresaleIsActive(false);
      await expect(
        contract.mintPresale(1, 1, 0, presaleTree.getProof(addrs[0]), {
          value: presalePrice,
        })
      ).to.be.revertedWith("Presale not active");
    });

    it("cannot mint if Merkle root is not set", async function () {
      await contractAsOwner.setPresaleMerkleRoot(ZERO_BYTES, MOCK_IPFS_HASH);
      await expect(
        contract.mintPresale(1, 1, 0, presaleTree.getProof(addrs[0]), {
          value: presalePrice,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("cannot mint if Merkle root is set to the root of a different tree", async function () {
      const newTree = new MerkleTree([
        [addrs[0], 1, 0],
        // Different second leaf.
        [addrs[1], 1, 0],
      ]);
      await contractAsOwner.setPresaleMerkleRoot(
        newTree.getRoot(),
        MOCK_IPFS_HASH
      );
      await expect(
        contract.mintPresale(1, 1, 0, presaleTree.getProof(addrs[0]), {
          value: presalePrice,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("cannot mint with a proof that does not match the sender", async function () {
      const contractFromAccount1 = contract.connect(accounts[1]);
      const proof = presaleTree.getProof(addrs[0]);
      await expect(
        contractFromAccount1.mintPresale(1, 1, 0, proof, {
          value: presalePrice,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("cannot mint with maxMints that does not match the Merkle tree", async function () {
      await expect(
        // Use maxMints of 2 when the tree has maxMints of 1.
        contract.mintPresale(1, 2, 0, presaleTree.getProof(addrs[0]), {
          value: presalePrice,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("cannot mint with voucherAmount that does not match the Merkle tree", async function () {
      await expect(
        // Use voucherAmount of 1 when the tree has voucherAmount of 0.
        contract.mintPresale(1, 1, 1, presaleTree.getProof(addrs[0]), {
          value: presalePrice,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    // Test various sizes of Merkle tree. In each case, make sure everyone can mint (random order).
    // Note that the min supported Merkle tree size is two leaves.
    for (let n = 2; n <= MAX_TREE_SIZE_TO_TEST; n++) {
      it(`mints presale tokens from tree with ${n} leaves`, async function () {
        // Set up the tree.
        const tree = new MerkleTree(leaves.slice(0, n));
        const root = tree.getRoot();
        await contractAsOwner.setPresaleMerkleRoot(root, MOCK_IPFS_HASH);

        // Pick a random mint order.
        const mintOrder = _.shuffle(_.range(n));

        // Query current price and supply.
        let currentSupply = await contract.totalSupply();

        // For each sender in the mint order, mint their max amount...
        for (const i of mintOrder) {
          // Get the leaf info for the sender.
          const sender = accounts[i];
          const [address, maxMints, voucherAmount] = tree.leaves[i];

          // Just a sanity check.
          expect(sender.address).to.equal(address, "Failed sanity check");

          // Get and verify the cost.
          // Note that this cost won't account for any voucher amount.
          const cost = await contract.getCost(maxMints, true);
          expect(cost).to.equal(presalePrice.mul(maxMints));

          // Get the proof and use it to mint.
          const contractFromSender = contract.connect(sender);
          const proof = tree.getProof(address);
          await expect(
            contractFromSender.mintPresale(
              maxMints,
              maxMints,
              voucherAmount,
              proof,
              {
                value: cost,
              }
            )
          )
            .to.emit(contract, "Transfer")
            .withArgs(ZERO_ADDRESS, address, currentSupply);

          // Expect that they cannot mint again after minting the max.
          await expect(
            contractFromSender.mintPresale(
              maxMints,
              maxMints,
              voucherAmount,
              proof,
              {
                value: cost,
              }
            )
          ).to.be.revertedWith("Presale mints exceeded");

          currentSupply = currentSupply.add(maxMints);
        }
      });
    }
  });

  describe("after finalize", function () {
    beforeEach(async function () {
      // Must reveal before finalizing.
      await contractAsOwner.setIsRevealed(true);
      await contractAsOwner.finalize();
    });

    it("owner cannot call setProvenanceHash", async function () {
      await expect(
        contractAsOwner.setProvenanceHash(MOCK_PROVENANCE_HASH)
      ).to.be.revertedWith("Metadata is finalized");
    });

    it("owner cannot call setIsRevealed", async function () {
      await expect(contractAsOwner.setIsRevealed(false)).to.be.revertedWith(
        "Metadata is finalized"
      );
    });

    it("owner cannot call setBaseURI", async function () {
      await expect(
        contractAsOwner.setBaseURI("ipfs://example")
      ).to.be.revertedWith("Metadata is finalized");
    });

    it("owner cannot call finalize", async function () {
      await expect(contractAsOwner.finalize()).to.be.revertedWith(
        "Metadata is finalized"
      );
    });
  });

  describe("public sale minting", async function () {
    beforeEach(async function () {
      // Initial setup: Set auction to start in one hour and go for next 24 hours.
      // Start the sale. Minting can take place immediately, but the price will only begin to fall
      // after one hour has passed.
      const nowSeconds = (await ethers.provider.getBlock("latest")).timestamp;
      const start = nowSeconds + 60 * 60; // 1 hour
      const end = start + 60 * 60 * 24; // 24 hours
      await contractAsOwner.setAuctionStartAndEnd(start, end);
      await contractAsOwner.setSaleIsActive(true);
    });

    it("before the auction starts, can mint at the starting price", async function () {
      // Expect the price to be exactly equal to the starting price.
      expect(await contract.getCost(3, false)).to.equal(
        auctionPriceStart.mul(3)
      );

      // Mint 1, 2, or 3 tokens at once.
      await expectMintedLogs(
        contractAsUser.mint(1, { value: auctionPriceStart }),
        user.address,
        [0]
      );
      await expectMintedLogs(
        contractAsUser.mint(2, { value: auctionPriceStart.mul(2) }),
        user.address,
        [1, 2]
      );
      await expectMintedLogs(
        contractAsUser.mint(3, { value: auctionPriceStart.mul(3) }),
        user.address,
        [3, 4, 5]
      );

      await expectWithdrawBalance(auctionPriceStart.mul(6));

      // Check that the tx reverts if value is too low.
      await expect(
        contractAsUser.mint(1, { value: auctionPriceStart.sub(1) })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(2, { value: auctionPriceStart.mul(2).sub(1) })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(3, { value: auctionPriceStart.mul(3).sub(1) })
      ).to.be.revertedWith("Insufficient payment");

      expect(await contract.totalSupply()).to.equal(6);
    });

    it("once the auction starts, can mint at the starting price", async function () {
      // Advance an hour.
      await increaseTime(60 * 60);

      // Mint 1, 2, or 3 tokens at once, using the starting price.
      await expectMintedLogs(
        contractAsUser.mint(1, { value: auctionPriceStart }),
        user.address,
        [0]
      );
      await expectMintedLogs(
        contractAsUser.mint(2, { value: auctionPriceStart.mul(2) }),
        user.address,
        [1, 2]
      );
      await expectMintedLogs(
        contractAsUser.mint(3, { value: auctionPriceStart.mul(3) }),
        user.address,
        [3, 4, 5]
      );

      await expectWithdrawBalance(auctionPriceStart.mul(6));

      // Mint 1, 2, or 3 tokens at once, using the queried price.
      await contractAsUser.mint(1, { value: await contract.getCost(1, false) });
      await contractAsUser.mint(2, { value: await contract.getCost(2, false) });
      await contractAsUser.mint(3, { value: await contract.getCost(3, false) });

      // Check that the tx reverts if value is too low.
      const discountAmount = ethers.utils.parseEther("0.001");
      await expect(
        contractAsUser.mint(1, { value: auctionPriceStart.sub(discountAmount) })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(2, {
          value: auctionPriceStart.mul(2).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(3, {
          value: auctionPriceStart.mul(3).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");

      expect(await contract.totalSupply()).to.equal(12);
    });

    it("halfway through, can mint at the average of start and end prices", async function () {
      // Advance 13 hours (halfway between auction start and end).
      await increaseTime(60 * 60 * 13);

      // Mint 1, 2, or 3 tokens at once, using the expected price.
      const expectedPrice = auctionPriceStart.add(auctionPriceEnd).div(2);
      await expectMintedLogs(
        contractAsUser.mint(1, { value: expectedPrice }),
        user.address,
        [0]
      );
      await expectMintedLogs(
        contractAsUser.mint(2, { value: expectedPrice.mul(2) }),
        user.address,
        [1, 2]
      );
      await expectMintedLogs(
        contractAsUser.mint(3, { value: expectedPrice.mul(3) }),
        user.address,
        [3, 4, 5]
      );

      await expectWithdrawBalance(expectedPrice.mul(6));

      // Mint 1, 2, or 3 tokens at once, using the queried price.
      await contractAsUser.mint(1, { value: await contract.getCost(1, false) });
      await contractAsUser.mint(2, { value: await contract.getCost(2, false) });
      await contractAsUser.mint(3, { value: await contract.getCost(3, false) });

      // Check that the tx reverts if value is too low.
      const discountAmount = ethers.utils.parseEther("0.001");
      await expect(
        contractAsUser.mint(1, { value: expectedPrice.sub(discountAmount) })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(2, {
          value: expectedPrice.mul(2).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(3, {
          value: expectedPrice.mul(3).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");

      expect(await contract.totalSupply()).to.equal(12);
    });

    it("right after the auction has ended, can mint at the end price", async function () {
      // Advance 25 hours (right at or after the auction end).
      await increaseTime(60 * 60 * 25);

      // Mint 1, 2, or 3 tokens at once, using the end price.
      await expectMintedLogs(
        contractAsUser.mint(1, { value: auctionPriceEnd }),
        user.address,
        [0]
      );
      await expectMintedLogs(
        contractAsUser.mint(2, { value: auctionPriceEnd.mul(2) }),
        user.address,
        [1, 2]
      );
      await expectMintedLogs(
        contractAsUser.mint(3, { value: auctionPriceEnd.mul(3) }),
        user.address,
        [3, 4, 5]
      );

      await expectWithdrawBalance(auctionPriceEnd.mul(6));

      // Mint 1, 2, or 3 tokens at once, using the queried price.
      await contractAsUser.mint(1, { value: await contract.getCost(1, false) });
      await contractAsUser.mint(2, { value: await contract.getCost(2, false) });
      await contractAsUser.mint(3, { value: await contract.getCost(3, false) });

      // Check that the tx reverts if value is too low.
      const discountAmount = ethers.utils.parseEther("0.001");
      await expect(
        contractAsUser.mint(1, { value: auctionPriceEnd.sub(discountAmount) })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(2, {
          value: auctionPriceEnd.mul(2).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(3, {
          value: auctionPriceEnd.mul(3).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");

      expect(await contract.totalSupply()).to.equal(12);
    });

    it("long after the auction has ended, can mint at the end price", async function () {
      // Advance 2500 hours (a long time after the auction end).
      await increaseTime(60 * 60 * 2500);

      // Mint 1, 2, or 3 tokens at once, using the end price.
      await expectMintedLogs(
        contractAsUser.mint(1, { value: auctionPriceEnd }),
        user.address,
        [0]
      );
      await expectMintedLogs(
        contractAsUser.mint(2, { value: auctionPriceEnd.mul(2) }),
        user.address,
        [1, 2]
      );
      await expectMintedLogs(
        contractAsUser.mint(3, { value: auctionPriceEnd.mul(3) }),
        user.address,
        [3, 4, 5]
      );

      await expectWithdrawBalance(auctionPriceEnd.mul(6));

      // Mint 1, 2, or 3 tokens at once, using the queried price.
      await contractAsUser.mint(1, { value: await contract.getCost(1, false) });
      await contractAsUser.mint(2, { value: await contract.getCost(2, false) });
      await contractAsUser.mint(3, { value: await contract.getCost(3, false) });

      // Check that the tx reverts if value is too low.
      const discountAmount = ethers.utils.parseEther("0.001");
      await expect(
        contractAsUser.mint(1, { value: auctionPriceEnd.sub(discountAmount) })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(2, {
          value: auctionPriceEnd.mul(2).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        contractAsUser.mint(3, {
          value: auctionPriceEnd.mul(3).sub(discountAmount),
        })
      ).to.be.revertedWith("Insufficient payment");

      expect(await contract.totalSupply()).to.equal(12);
    });

    it("can mint the max mint per tx, but not more", async function () {
      // Canot mint the max mint per tx.
      const expectToEmit = expect(
        contractAsUser.mint(5, { value: auctionPriceStart.mul(5) })
      ).to.emit(contract, "Transfer");
      for (let i = 0; i < 5; i++) {
        await expectToEmit.withArgs(ZERO_ADDRESS, user.address, i);
      }

      // Canot mint in exccess of the max mint per tx.
      await expect(
        contractAsUser.mint(6, { value: auctionPriceStart.mul(6) })
      ).to.be.revertedWith("numToMint too large");

      expect(await contract.totalSupply()).to.equal(5);
    });

    it("handles the setStartingIndex edge case", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const latestBlockNumber = latestBlock.number;
      const targetBlock = latestBlockNumber + 2;
      await contractAsOwner.fallbackSetStartingIndexBlockNumber();
      expect(await contract._startingIndexBlockNumber()).to.equal(targetBlock);

      // Mine enough bocks that the hash of the target block is no longer available on-chain.
      for (let i = 0; i < 258; i++) {
        await evmMine();
      }

      // Expect the most recent block to be used as a fallback.
      const fallbackBlock = await ethers.provider.getBlock("latest");
      const fallbackBlockNumber = fallbackBlock.number;
      const maxSupply = await contract.MAX_SUPPLY();
      const expectedStartingIndex = BigNumber.from(fallbackBlock.hash).mod(
        maxSupply
      );

      // Set the starting index.
      await expect(contractAsUser.setStartingIndex())
        .to.emit(contract, "SetStartingIndex")
        .withArgs(expectedStartingIndex, fallbackBlockNumber);
      expect(await contract._startingIndex()).to.equal(expectedStartingIndex);
    });

    it("goes through the full contract lifecycle to mint the whole supply", async function () {
      if (!RUN_END_TO_END_LIFECYCLE_TEST) {
        console.log("Skipping end-to-end lifecycle test.");
        return;
      }

      let totalMinted = 0;
      let presaleMints = 0;
      let presaleUsers = 0;
      let presaleGas = BigNumber.from(0);
      let presaleProceeds = BigNumber.from(0);
      let saleMints = 0;
      let saleUsers = 0;
      let saleGas = BigNumber.from(0);
      let saleProceeds = BigNumber.from(0);
      const ownerTxes: ContractTransaction[] = [];

      // Mint reserved tokens.
      const reservedSupply = (await contract.RESERVED_SUPPLY()).toNumber();
      ownerTxes.push(
        await contractAsOwner.mintReservedTokens(reservedSupply / 2)
      );
      ownerTxes.push(
        await contractAsOwner.mintReservedTokens(reservedSupply / 2)
      );
      totalMinted += reservedSupply;
      console.log("Minted reserved tokens.");

      console.log("  Minted:", (await contract.totalSupply()).toString());
      expect(await contract.totalSupply()).to.equal(reservedSupply);
      expect(await contract.balanceOf(owner.address)).to.equal(reservedSupply);

      // Begin the presale.
      ownerTxes.push(
        await contractAsOwner.setProvenanceHash("mock-provenance-hash")
      );
      const tree = merkleTreeFromCompactData(
        merkleData,
        RANKS_FROM_WORST_TO_BEST
      );
      ownerTxes.push(
        await contractAsOwner.setPresaleMerkleRoot(
          tree.getRoot(),
          MOCK_IPFS_HASH
        )
      );
      ownerTxes.push(await contractAsOwner.setPresaleIsActive(true));
      console.log("Started the presale.");

      // Mint from all the governors.
      // The governors can mint at most 3 during the presale, with 1 free mint.
      const governors = _.shuffle(merkleData[2]);
      for (const address of governors) {
        const mintAmount =
          Math.random() < 0.9 ? 3 : Math.floor(Math.random() * 3) + 1;
        const proof = tree.getProof(address);
        const value = presalePrice.mul(mintAmount - 1);
        const tx = await contract
          .connect(await impersonateAndSendFunds(address))
          .mintPresale(mintAmount, 3, presalePrice, proof, {
            value,
          });

        const receipt = await tx.wait();
        presaleMints += mintAmount;
        presaleUsers++;
        presaleGas = presaleGas.add(receipt.gasUsed);
        presaleProceeds = presaleProceeds.add(value);

        totalMinted += mintAmount;
        expect(await contract.balanceOf(address)).to.equal(mintAmount);
      }
      console.log("Governors minted.");

      console.log("  Minted:", (await contract.totalSupply()).toString());
      expect(await contract.totalSupply()).to.equal(totalMinted);

      // Mint from all the citizens.
      // The citizens can mint at most 3 during the presale.
      const citizens = _.shuffle(merkleData[1]);
      for (const address of citizens) {
        const mintAmount =
          Math.random() < 0.8 ? 3 : Math.floor(Math.random() * 3) + 1;
        const proof = tree.getProof(address);
        const value = presalePrice.mul(mintAmount);
        const tx = await contract
          .connect(await impersonateAndSendFunds(address))
          .mintPresale(mintAmount, 3, 0, proof, {
            value,
          });

        const receipt = await tx.wait();
        presaleMints += mintAmount;
        presaleUsers++;
        presaleGas = presaleGas.add(receipt.gasUsed);
        presaleProceeds = presaleProceeds.add(value);

        totalMinted += mintAmount;
        expect(await contract.balanceOf(address)).to.equal(mintAmount);
      }
      console.log("Citizens minted.");

      console.log("  Minted:", (await contract.totalSupply()).toString());
      expect(await contract.totalSupply()).to.equal(totalMinted);

      // Mint from 50% of the peasants.
      // The peasants can mint at most 2 during the presale.
      const peasants = _.shuffle(merkleData[0]);
      for (const address of peasants.slice(peasants.length / 2)) {
        const mintAmount = Math.floor(Math.random() * 2) + 1;
        const proof = tree.getProof(address);
        const value = presalePrice.mul(mintAmount);
        const tx = await contract
          .connect(await impersonateAndSendFunds(address))
          .mintPresale(mintAmount, 2, 0, proof, {
            value,
          });

        const receipt = await tx.wait();
        presaleMints += mintAmount;
        presaleUsers++;
        presaleGas = presaleGas.add(receipt.gasUsed);
        presaleProceeds = presaleProceeds.add(value);

        totalMinted += mintAmount;
        expect(await contract.balanceOf(address)).to.equal(mintAmount);
      }
      console.log("Peasants minted.");

      console.log("  Minted:", (await contract.totalSupply()).toString());
      expect(await contract.totalSupply()).to.equal(totalMinted);

      // Begin the public sale.
      const nowSeconds = (await ethers.provider.getBlock("latest")).timestamp;
      const start = nowSeconds + 60 * 60 * 1; // 1 hour
      const end = start + 60 * 60 * 24; // 24 hours
      ownerTxes.push(await contractAsOwner.setAuctionStartAndEnd(start, end));
      ownerTxes.push(await contractAsOwner.setPresaleIsActive(false));
      ownerTxes.push(await contractAsOwner.setSaleIsActive(true));
      console.log("Began the public sale.");

      // Starting halfway through the public sale, sell up to 1000 tokens every hour.
      await increaseTime(60 * 60 * 13); // 13 hours
      const maxSupply = (await contract.MAX_SUPPLY()).toNumber();
      const maxMintPerUser = 40;
      const maxMintPerTx = (await contract.MAX_MINT_PER_TX()).toNumber();
      while (totalMinted !== maxSupply) {
        console.log(
          `  Minted: ${totalMinted} / ${maxSupply} (price = ${ethers.utils.formatEther(
            await contract.getCost(1, false)
          )} ETH)`
        );
        const targetMint = Math.min(
          maxSupply - totalMinted,
          Math.floor(Math.random() * 1000)
        );

        let mintedOutOfTarget = 0;
        while (mintedOutOfTarget !== targetMint) {
          const price = await contract.getCost(1, false);
          const balance = ethers.utils.parseEther("4");
          const user = await createWalletAndSendFunds(balance);
          const userMint = Math.min(
            targetMint - mintedOutOfTarget,
            Math.floor(
              balance.div(price.add(ethers.utils.parseEther("0.01"))).toNumber()
            ),
            Math.random() < 0.5
              ? maxMintPerUser
              : Math.floor(Math.random() * maxMintPerUser) + 1
          );

          let mintedOutOfUserTarget = 0;
          while (mintedOutOfUserTarget !== userMint) {
            const txMint = Math.min(
              userMint - mintedOutOfUserTarget,
              maxMintPerTx
            );
            const value = price.mul(txMint);
            let tx;
            try {
              tx = await contract.connect(user).mint(txMint, { value });
            } catch (error) {
              if (
                !(error as Error).message.includes(
                  "sender doesn't have enough funds"
                )
              ) {
                throw error;
              }
              console.log("warning: a tx failed with 'not enough funds'");
              break;
            }

            const receipt = await tx.wait();
            saleMints += txMint;
            saleGas = saleGas.add(receipt.gasUsed);
            saleProceeds = saleProceeds.add(value);

            mintedOutOfUserTarget += txMint;
            mintedOutOfTarget += txMint;
            totalMinted += txMint;
          }

          saleUsers++;
        }
        await increaseTime(60 * 60); // 1 hour.
      }
      console.log("Sold out.");

      const sender = await createWalletAndSendFunds();
      await contract.connect(sender).setStartingIndex();

      // Finalize the metadata.
      ownerTxes.push(await contractAsOwner.setIsRevealed(true));
      ownerTxes.push(await contractAsOwner.setBaseURI("ipfs://example-cid/"));
      ownerTxes.push(await contractAsOwner.finalize());

      // Claim proceeds.
      const withdrawnAmount = await ethers.provider.getBalance(
        contract.address
      );
      ownerTxes.push(await expectWithdrawBalance(withdrawnAmount));

      // Log stats.
      const ownerReceipts = await Promise.all(ownerTxes.map((tx) => tx.wait()));
      const ownerGas = _.reduce(
        ownerReceipts,
        (acc, receipt) => acc.add(receipt.gasUsed),
        BigNumber.from(0)
      );
      console.log();
      console.log("- Total minted:", totalMinted);
      console.log("- Total holders:", 1 + presaleUsers + saleUsers);
      console.log("- Presale mints:", presaleMints);
      console.log("- Presale gas used:", presaleGas.toString());
      console.log(
        "- Presale average gas per mint:",
        presaleGas.div(presaleMints).toString()
      );
      console.log(
        "- Presale average price per mint (ETH):",
        ethers.utils.formatEther(presaleProceeds.div(presaleMints))
      );
      console.log("- Public sale mints:", saleMints);
      console.log("- Public sale gas used:", saleGas.toString());
      console.log(
        "- Public sale average gas per mint:",
        saleGas.div(saleMints).toString()
      );
      console.log(
        "- Public sale average price per mint (ETH):",
        ethers.utils.formatEther(saleProceeds.div(saleMints))
      );
      console.log("- Owner txes:", ownerTxes.length);
      console.log("- Owner gas used:", ownerGas.toString());
      console.log(
        "- Presale proceeds (ETH):",
        ethers.utils.formatEther(presaleProceeds)
      );
      console.log(
        "- Public sale proceeds (ETH):",
        ethers.utils.formatEther(saleProceeds)
      );
      console.log(
        "- Withdrawn amount (ETH):",
        ethers.utils.formatEther(withdrawnAmount)
      );
      console.log();
      console.log(
        "Owner txes:",
        ownerReceipts.map((receipt) => receipt.gasUsed.toString())
      );
    });
  });

  async function expectWithdrawBalance(
    expectedBalance: BigNumberish
  ): Promise<ContractTransaction> {
    const balanceBefore = await ethers.provider.getBalance(owner.address);
    const tx = contractAsOwner.withdraw();
    await expect(tx).to.emit(contract, "Withdrew").withArgs(expectedBalance);
    const receipt = await (await tx).wait();
    const gasPaid = receipt.gasUsed.mul(receipt.effectiveGasPrice);
    const balanceAfter = await ethers.provider.getBalance(owner.address);
    expect(balanceAfter.sub(balanceBefore)).to.equal(
      BigNumber.from(expectedBalance).sub(gasPaid)
    );
    return tx;
  }

  async function expectMintedLogs(
    tx: Promise<Transaction>,
    expectedRecipient: string,
    expectedTxIds: BigNumberish[]
  ): Promise<void> {
    const expectedToEmit = expect(tx).to.emit(contract, "Transfer");
    for (const id of expectedTxIds) {
      await expectedToEmit.withArgs(ZERO_ADDRESS, expectedRecipient, id);
    }
  }

  async function createWalletAndSendFunds(
    amountToSend: BigNumberish = ethers.utils.parseEther("2")
  ): Promise<SignerWithAddress> {
    const wallet = Wallet.createRandom().connect(ethers.provider);
    await fundAddress(wallet.address, amountToSend);
    return wallet as unknown as SignerWithAddress;
  }

  async function impersonateAndSendFunds(
    address: string,
    amountToSend: BigNumberish = ethers.utils.parseEther("2")
  ): Promise<SignerWithAddress> {
    await fundAddress(address, amountToSend);
    return impersonate(address);
  }

  async function fundAddress(
    address: string,
    amountToSend: BigNumberish
  ): Promise<void> {
    const threshold = BigNumber.from(amountToSend).mul(3).div(2);
    let i = 0;
    while ((await ethers.provider.getBalance(addrs[i])).lt(threshold)) {
      i++;
    }
    const signer = accounts[i];
    await signer.sendTransaction({
      to: address,
      value: amountToSend,
    });
  }
});
