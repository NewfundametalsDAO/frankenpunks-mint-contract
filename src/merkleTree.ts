import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import _ from "lodash";

import { bufferFromHex } from "./util";

// The Merkle tree node contains: (address account, uint256 maxMints, uint256 voucherAmount)
export type MerkleTreeLeaf = [string, BigNumberish, BigNumberish];
const LEAF_TYPES = ["address", "uint256", "uint256"];

export class NotInMerkleTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export default class MerkleTree {
  public readonly leaves: MerkleTreeLeaf[];
  public readonly height: number;
  protected readonly lengthByRow: number[];
  protected readonly memo: Record<string, Buffer> = {};

  constructor(leaves: MerkleTreeLeaf[]) {
    this.leaves = leaves;
    const n = this.leaves.length;
    if (n < 2) {
      throw new Error("Expected at least two leaves");
    }

    // Calculate the tree height, e.g. a Merkle tree with 8 nodes will have a height of 4.
    // The height is at least 2.
    this.height = ((n - 1).toString as any)(2).length + 1;

    // Calculate the number of nodes in each row.
    this.lengthByRow = new Array(this.height);
    this.lengthByRow[this.height - 1] = this.leaves.length;
    let row = this.height - 2;
    while (row >= 0) {
      this.lengthByRow[row] = Math.ceil(this.lengthByRow[row + 1] / 2);
      row--;
    }
  }

  getRoot(): Buffer {
    const root = this.getNodeHash(0, 0);
    return root;
  }

  getProof(address: string): Buffer[] {
    const proof: Buffer[] = [];
    let column = _.findIndex(
      this.leaves,
      ([a]) => a.toLowerCase() === address.toLowerCase()
    );
    if (column === -1) {
      throw new NotInMerkleTreeError(
        `Address '${address}' is not in the Merkle tree.`
      );
    }
    let row = this.height - 1;
    while (row > 0) {
      if (column % 2 === 0) {
        if (column === this.lengthByRow[row] - 1) {
          // If the left node is unpaired, then skip this level of the tree in the proof.
        } else {
          proof.push(this.getNodeHash(row, column + 1));
        }
      } else {
        proof.push(this.getNodeHash(row, column - 1));
      }

      // Move up a row.
      column >>= 1;
      row--;
    }
    return proof;
  }

  getNodeHash(row: number, column: number): Buffer {
    const key = `${row},${column}`;
    if (!(key in this.memo)) {
      this.memo[key] = this.getNodeHashInner(row, column);
    }
    return this.memo[key];
  }

  private getNodeHashInner(row: number, column: number): Buffer {
    // Base case: bottom row - hash the leaf.
    if (row === this.height - 1) {
      const resultHexString = ethers.utils.solidityKeccak256(
        LEAF_TYPES,
        this.leaves[column]
      );
      return bufferFromHex(resultHexString);
    }

    // Recurse down the tree.
    const childRow = row + 1;
    const leftChildColumn = column << 1;
    const leftChild = this.getNodeHash(childRow, leftChildColumn);

    if (leftChildColumn === this.lengthByRow[childRow] - 1) {
      // If the left child is unpaired, then this node hash is equal to the left node hash.
      return leftChild;
    }

    const rightChild = this.getNodeHash(childRow, leftChildColumn + 1);
    const resultHexString = ethers.utils.keccak256(
      Buffer.concat([leftChild, rightChild].sort(Buffer.compare))
    );
    return bufferFromHex(resultHexString);
  }
}
