/**
 * Update the Merkle root on-chain.
 *
 * You should first calculate the root using the writeCompactMerkleTreeData.ts script.
 *
 * Usage: npx hardhat run scripts/updateMerkleRoot.ts
 */

import { ContractReceipt, ContractTransaction } from "ethers";
import { ethers } from "hardhat";

async function main() {
  if (!process.env.FP_ADDRESS) {
    throw new Error("Missing required env var FP_ADDRESS");
  }
  const fpAddress = process.env.FP_ADDRESS;
  if (!process.env.MERKLE_ROOT) {
    throw new Error("Missing required env var MERKLE_ROOT");
  }
  const merkleRoot = process.env.MERKLE_ROOT;

  const FrankenPunks = await ethers.getContractFactory("FrankenPunks");
  const contract = await FrankenPunks.attach(fpAddress);
  await wait(contract.setPresaleMerkleRoot(merkleRoot));
  console.log(`Merkle root updated: ${merkleRoot}`);
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
