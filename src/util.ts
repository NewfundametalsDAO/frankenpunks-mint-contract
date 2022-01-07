export function bufferToHex(buffer: Buffer): string {
  return `0x${buffer.toString("hex")}`;
}

export function bufferFromHex(hexString: string): Buffer {
  return Buffer.from(hexString.slice(2), "hex");
}
