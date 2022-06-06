import { ethers } from "hardhat";

import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const Stacking = await ethers.getContractFactory("Stacking");
  const stacking = await Stacking.deploy();

  await stacking.deployed();

  console.log("Stacking deployed to:", stacking.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
