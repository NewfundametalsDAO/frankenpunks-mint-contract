import { ethers } from "hardhat";
import fs from "fs";
import { BigNumberish } from "ethers";
import _ from "lodash";

import MerkleTree, { MerkleTreeLeaf } from "../merkleTree";

// fileName, maxMints, voucherAmount
export type RankInfo = [string, number, BigNumberish];

/**
 * Read one address from the start of each line in the file.
 */
function readAddressesFromFile(fileName: string): string[] {
  const file = fs.readFileSync(fileName).toString();
  const lines = file.split("\n");

  // Remove last line if it's empty.
  if (lines[lines.length - 1].length === 0) {
    lines.pop();
  }

  // Parsing. Expect an address at the start of every line.
  const addresses = lines.map((line, i) => {
    const match = line.match(/\w+/);
    if (!match) {
      throw new Error(`Empty line on line ${i}`);
    }
    return match[0];
  });

  // Validation.
  addresses.forEach((address, i) => {
    if (!ethers.utils.isAddress(address)) {
      throw new Error(
        `Not an address (${fileName} line ${i + 1}): '${address}' (length ${
          address.length
        })`
      );
    }
  });

  // Normalization.
  return addresses.map((address) => ethers.utils.getAddress(address));
}

export function constructPresaleCompactData(
  ranksFromWorstToBest: RankInfo[],
  outFilePath: string
): void {
  const normalizedAddresses: string[][] = ranksFromWorstToBest.map(
    ([fileName]) => readAddressesFromFile(fileName)
  );

  // Find the best rank for each address.
  const addressToBestRankId: Record<string, number> = {};

  normalizedAddresses.forEach((addressGroup, rankId) => {
    addressGroup.forEach((address) => {
      addressToBestRankId[address] = rankId;
    });
  });

  // Group the addresses by rank again.
  const grouped = _.chain(addressToBestRankId)
    .map((rankId, address) => ({ rankId, address }))
    .groupBy("rankId")
    .mapValues((arr) => arr.map(({ address }) => address))
    .value();

  // Sanity check.
  console.log("Original lists:");
  ranksFromWorstToBest.forEach((rankInfo, i) => {
    const fileName = rankInfo[0].split("/").slice(-1)[0];
    console.log(` - ${fileName}: ${normalizedAddresses[i].length}`);
  });
  console.log();
  console.log("After matching duplicates to their highest rank:");
  ranksFromWorstToBest.forEach((rankInfo, i) => {
    const fileName = rankInfo[0].split("/").slice(-1)[0];
    console.log(` - ${fileName}: ${grouped[i].length}`);
  });

  const groupedAsArray = _.range(ranksFromWorstToBest.length).map(
    (i) => grouped[i]
  );
  const compactDataJson = JSON.stringify(groupedAsArray);
  fs.writeFileSync(outFilePath, compactDataJson);
}

export function leavesFromCompactData(
  groupedAsArray: string[][],
  ranksFromWorstToBest: RankInfo[]
): MerkleTreeLeaf[] {
  const leaves = _.flatMap(groupedAsArray, (addresses, rankId) => {
    return addresses.map((address) => {
      const leaf: MerkleTreeLeaf = [
        address,
        ranksFromWorstToBest[rankId][1],
        ranksFromWorstToBest[rankId][2],
      ];
      return leaf;
    });
  });
  return leaves;
}

export function merkleTreeFromCompactData(
  groupedAsArray: string[][],
  ranksFromWorstToBest: RankInfo[]
): MerkleTree {
  const leaves = leavesFromCompactData(groupedAsArray, ranksFromWorstToBest);
  return new MerkleTree(leaves);
}
