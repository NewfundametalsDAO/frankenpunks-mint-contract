// npx hardhat run scripts/initialize.ts

import { ContractReceipt, ContractTransaction } from "ethers";
import { ethers } from "hardhat";

import merkleData from "../data/merkle.json";
import { RANKS_FROM_WORST_TO_BEST } from "../src/constants";
import { merkleTreeFromCompactData } from "../src/whitelist/loadWhitelist";

// TODO: Update before using on mainnet.
const RINKEBY_CONTRACT = "0x3a2B010392a31db290392057173917ABd8181958";

async function main() {
  // TODO: Update before using on mainnet.
  const FrankenPunks = await ethers.getContractFactory("FrankenPunks");
  const contract = await FrankenPunks.attach(RINKEBY_CONTRACT);

  const reservedSupply = (await contract.RESERVED_SUPPLY()).toNumber();
  await wait(contract.mintReservedTokens(reservedSupply / 2));
  await wait(contract.mintReservedTokens(reservedSupply / 2));
  console.log("Minted tokens:", contract.totalSupply());

  await wait(contract.setProvenanceHash("mock-provenance-hash"));
  console.log("Set provenance hash");

  const tree = merkleTreeFromCompactData(merkleData, RANKS_FROM_WORST_TO_BEST);
  await wait(contract.setPresaleMerkleRoot(tree.getRoot()));
  console.log("Set Merkle root");

  await wait(contract.setPresaleIsActive(true));
  console.log("Activated presale");

  const start = (await ethers.provider.getBlock("latest")).timestamp;
  const end = start + 60 * 60 * 24 * 7; // 7 days
  await wait(contract.setAuctionStartAndEnd(start, end));
  console.log("Set auction start and end");

  await wait(contract.setSaleIsActive(true));
  console.log("Activated sale");
}

async function wait(
  tx: ContractTransaction | Promise<ContractTransaction>
): Promise<ContractReceipt> {
  return (await tx).wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
