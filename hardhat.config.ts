import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

dotenv.config();

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("Stake", "Total supply of ERC-20 token")
  .addParam("token", "Token address")
  .addParam("stacking", "Stacking address")
  .setAction(async (taskArgs, hre) => {
    // const myToken = await hre.ethers.getContractFactory("MyTokenERC20");
    const myStake = await hre.ethers.getContractFactory("Stacking");
    // const token = myToken.attach(taskArgs.token);
    const stacke = myStake.attach(taskArgs.staking);
    const [minter] = await hre.ethers.getSigners();
    await stacke
      .connect(minter)
      .addPool(taskArgs.token, taskArgs.token, 10, 1, 1000);
    const total = (
      await (await stacke.connect(minter)).getPoolCount()
    ).toNumber();
    console.log(`Total  is ${total}`);
  });

task("transfer", "ERC-20 transfer")
  .addParam("token", "Token address")
  .addParam("spender", "Spender address")
  .addParam("amount", "Token amount")
  .setAction(async (taskArgs, hre) => {
    const myToken = await hre.ethers.getContractFactory("MyTokenERC20");
    const token = myToken.attach(taskArgs.token);
    const [minter] = await hre.ethers.getSigners();
    await (
      await token.connect(minter).transfer(taskArgs.spender, taskArgs.amount)
    ).wait();
    console.log(
      `${minter.address} has transferred ${taskArgs.amount} to ${taskArgs.spender}`
    );
  });

task("balanceOf", "Total supply of ERC-20 token")
  .addParam("token", "Token address")
  .addParam("account", "Account address")
  .setAction(async (taskArgs, hre) => {
    const myToken = await hre.ethers.getContractFactory("MyTokenERC20");
    const token = myToken.attach(taskArgs.token);
    const [minter] = await hre.ethers.getSigners();
    const balance = (
      await (await token.connect(minter)).balanceOf(taskArgs.account)
    ).toNumber();
    console.log(
      `Account ${taskArgs.account} has a total token balance:  ${balance} WTM`
    );
  });

task("approve", "ERC-20 approve")
  .addParam("token", "Token address")
  .addParam("spender", "Spender address")
  .addParam("amount", "Token amount")
  .setAction(async (taskArgs, hre) => {
    const myToken = await hre.ethers.getContractFactory("MyTokenERC20");
    const token = myToken.attach(taskArgs.token);
    const [sender] = await hre.ethers.getSigners();
    await (
      await token.connect(sender).approve(taskArgs.spender, taskArgs.amount)
    ).wait();
    console.log(
      `${sender.address} has approved ${taskArgs.amount} tokens to ${taskArgs.spender}`
    );
  });

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.5.0",
      },
      {
        version: "0.5.16",
      },
      {
        version: "0.8.14",
      },
    ],
  },
  networks: {
    ropsten: {
      url: process.env.ROPSTEN_URL,
      accounts: [
        "0xad864022b73050b6f672a687002d07fae0f94176534577a1bf61bd24fe12b43a",
      ],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      ropsten: process.env.ETHERSCAN_API_KEY,
    },
  },
};

export default config;
