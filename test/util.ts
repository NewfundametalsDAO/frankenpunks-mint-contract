import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish } from "ethers";
import hardhat, { ethers } from "hardhat";

export async function evmMine() {
  await ethers.provider.send("evm_mine", []);
}

export async function evmSnapshot(): Promise<string> {
  return ethers.provider.send("evm_snapshot", []);
}

export async function evmRevert(id: string): Promise<void> {
  await ethers.provider.send("evm_revert", [id]);
}

export async function impersonate(address: string): Promise<SignerWithAddress> {
  await hardhat.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  return ethers.getSigner(address);
}

export async function increaseTime(seconds: BigNumberish) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}
