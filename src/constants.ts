import { ethers } from "hardhat";

import { RankInfo } from "./whitelist/loadWhitelist";

export const RANKS_FROM_WORST_TO_BEST: RankInfo[] = [
  ["data/peasants.csv", 2, 0],
  ["data/citizens.csv", 3, 0],
  ["data/governors.csv", 4, ethers.utils.parseEther("0.088")],
];

export const MOCK_IPFS_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
