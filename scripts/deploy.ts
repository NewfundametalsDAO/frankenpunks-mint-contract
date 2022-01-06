// npx hardhat run scripts/deploy.ts

import { ethers } from "hardhat";

// TODO: Update before deploying.
const PLACEHOLDER_URI = "https://example.com";
const RINKEBY_OWNER = "0x6618683a785bb92d95Ded06841297FB3eE9a4c55";

async function main() {
  const FrankenPunks = await ethers.getContractFactory("FrankenPunks");
  const contract = await FrankenPunks.deploy(RINKEBY_OWNER, PLACEHOLDER_URI);
  await contract.deployed();
  console.log("FrankenPunks deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
