// npx hardhat run scripts/writeCompactMerkleTreeData.ts

import fs from "fs";
import { ethers } from "hardhat";
import {
  constructPresaleCompactData,
  merkleTreeFromCompactData,
  RankInfo,
} from "../src/whitelist/loadWhitelist";

const RANKS_FROM_WORST_TO_BEST: RankInfo[] = [
  ["data/peasants.csv", 2, 0],
  ["data/citizens.csv", 3, 0],
  ["data/governors.csv", 3, ethers.utils.parseEther("0.088")],
];
const OUT_FILE_PATH = "data/merkle.json";

async function main() {
  console.log("\n==== Starting parse and export... ====");
  constructPresaleCompactData(RANKS_FROM_WORST_TO_BEST, OUT_FILE_PATH);
  console.log("==== Complete. ====\n");

  const data = JSON.parse(fs.readFileSync(OUT_FILE_PATH).toString());

  // Also, test making a tree from the data and calculating the root.
  console.log("\n==== Creating Merkle tree and calculating root... ====");
  const tree = merkleTreeFromCompactData(data, RANKS_FROM_WORST_TO_BEST);
  console.log(tree.getRoot().toString("hex"));
  console.log("==== Complete. ====\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
