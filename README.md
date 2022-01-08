# FrankenPunks

This is the FrankenPunks NFT smart contract.

## Updating the whitelist
1. (One-time) Make sure your dev environment is set up with Node and NPM. Then run `npm install`.
1. You will need `citizens.csv`, `governors.csv`, and `peasants.csv` in a `data` folder in the root directory. The format of these files does not matter much as long as it's a CSV with one address per row, at the start of every row (no header row).
1. Make sure that `RANKS_FROM_WORST_TO_BEST` in `src/constants.ts` has the correct values.
1. Run `npx hardhat run scripts/writeCompactMerkleTreeData.ts`. This will do two things: it will use the CSVs to generate an updated `data/merkle.json` file, and it will log the Merkle root to the console.
1. The `data/merkle.json` file must be used in the frontend to support proof generation.
1. The Merkle root must be updated on the contract. This can be done using the `updateMerkleRoot` script (see below).

Example script invocation on Rinkeby:

```bash
# Note: RINKEBY_URL and PRIVATE_KEY are also required, and can be configured through .env
export FP_ADDRESS=0x3a2B010392a31db290392057173917ABd8181958
export MERKLE_ROOT=0x50fb338d16773120c91f7c8435411c5618e6c98341b6fb5130c802b879874a9c
npx hardhat run --network rinkeby scripts/updateMerkleRoot.ts
```
