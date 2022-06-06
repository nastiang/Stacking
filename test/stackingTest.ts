import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MyTokenERC20, Stacking } from "../typechain";
import { MyTokenERC20__factory, Stacking__factory } from "../typechain";
import { BigNumber } from "ethers";

describe("Stacking LP token", function () {
  let token: MyTokenERC20;
  // eslint-disable-next-line no-unused-vars
  let stacking: Stacking;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const tokenFactory = (await ethers.getContractFactory(
      "MyTokenERC20",
      owner
    )) as MyTokenERC20__factory;
    const totalSupply = 1000000;
    token = await tokenFactory.deploy(totalSupply, owner.address);
    const stackingFactory = (await ethers.getContractFactory(
      "Stacking"
    )) as Stacking__factory;
    stacking = await stackingFactory.deploy();
    await stacking.addPool(token.address, token.address, 10, 1, 1000);
  });

  describe("Deployment", function () {
    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await token.balanceOf(owner.address);
      expect(await token.totalSupply()).to.equal(ownerBalance);
    });
    it("Should return pools count", async function () {
      const count = await stacking.getPoolCount();
      expect(count.toNumber() === 1);
    });
  });

  describe("Update", function () {
    it("Should update reward per block in pool 0", async function () {
      await stacking.updatePool(0, token.address, token.address, 20, 1, 2000);
      const poolInfo = await stacking.pools(0);
      expect(poolInfo[7].toNumber() === 2000);
    });
  });

  describe("Stacke", function () {
    it("Should stacke 100 tokens", async function () {
      await token.approve(stacking.address, 100);
      await stacking.stake(0, 100);
      const userInfo = await stacking.userInfo(owner.address, 0);
      expect(userInfo.amount).to.equal(100);
      const userList = await stacking.userList(0, 0);
      expect(userList).to.equal(owner.address);
      const pendingReward = await stacking.pendingRewards(0, owner.address);
      expect(pendingReward.toNumber() === 10);
    });
    it("Should stacke 100 and restake tokens", async function () {
      await token.approve(stacking.address, 100);
      await stacking.stake(0, 100);
      await stacking.claimAndRestakeAll();
      const userInfo = await stacking.userInfo(owner.address, 0);
      expect(userInfo.amount).to.equal(110);
    });
    it("Should stacke 100 and stake one more", async function () {
      await token.approve(stacking.address, 200);
      await stacking.stake(0, 100);
      const userInfo = await stacking.userInfo(owner.address, 0);
      expect(userInfo.amount).to.equal(100);
      await stacking.stake(0, 100);
      const userInfo2 = await stacking.userInfo(owner.address, 0);
      expect(userInfo2.amount).to.equal(200);
      expect(userInfo2.rewardDebt).to.equal(20);
    });
  });

  describe("UnStacke", function () {
    it("Should stacke claim and unstacke tokens", async function () {
      const balance = await token.balanceOf(owner.address);
      await token.approve(stacking.address, 100);
      await token.transfer(stacking.address, 50);
      await stacking.stake(0, 100);
      const userInfo = await stacking.userInfo(owner.address, 0);
      expect(userInfo.amount).to.equal(100);
      await stacking.claim(0);
      await stacking.unstake(0, 100);
      const userInfo2 = await stacking.userInfo(owner.address, 0);
      expect(userInfo2.amount).to.equal(0);
      expect(await token.balanceOf(owner.address)).to.equal(
        balance.sub(50).add(10)
      );
    });

    it("Should stacke claimAll and unstackeAll tokens", async function () {
      const balance = await token.balanceOf(owner.address);
      await token.approve(stacking.address, 100);
      await token.transfer(stacking.address, 50);
      await stacking.stake(0, 100);
      const userInfo = await stacking.userInfo(owner.address, 0);
      expect(userInfo.amount).to.equal(100);
      await stacking.claimAll();
      await stacking.unstakeAll(0);
      const userInfo2 = await stacking.userInfo(owner.address, 0);
      expect(userInfo2.amount).to.equal(0);
      expect(await token.balanceOf(owner.address)).to.equal(
        balance.sub(50).add(10)
      );
    });


    it("Should stacke 100 and stake one more", async function () {
      await token.approve(stacking.address, 200);
      await stacking.stake(0, 100);
      const userInfo = await stacking.userInfo(owner.address, 0);
      expect(userInfo.amount).to.equal(100);
      await stacking.stake(0, 100);
      const userInfo2 = await stacking.userInfo(owner.address, 0);
      expect(userInfo2.amount).to.equal(200);
      expect(userInfo2.rewardDebt).to.equal(20);
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      await token.transfer(addr1.address, 50);
      const addr1Balance = await token.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(50);

      await token.connect(addr1).transfer(addr2.address, 50);
      const addr2Balance = await token.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });

    it("Should fail if sender doesn’t have enough tokens", async function () {
      const initialOwnerBalance = await token.balanceOf(owner.address);
      console.log("initialOwnerBalance = " + initialOwnerBalance);

      await expect(token.connect(addr1).transfer(owner.address, 1)).to.be
        .reverted;

      expect(await token.balanceOf(owner.address)).to.equal(
        initialOwnerBalance
      );
    });

    it("Should update balances after transfers", async function () {
      const initialOwnerBalance = await token.balanceOf(owner.address);

      await token.transfer(addr1.address, 100);

      await token.transfer(addr2.address, 50);

      const finalOwnerBalance = await token.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(150));

      const addr1Balance = await token.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(100);

      const addr2Balance = await token.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });

    it("TransferFrom test", async function () {
      await token.approve(addr1.address, 200);
      await token
        .connect(addr1)
        .transferFrom(owner.address, addr1.address, 100);
      const addr1Balance = await token.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(100);
    });
  });

  describe("Mint", function () {
    it("Mint test", async () => {
      const totalSupply = await token.totalSupply();
      const expectedResult = totalSupply.add(100);
      await token.mint(owner.address, 100);
      expect(await token.totalSupply()).to.equal(expectedResult);
    });
  });

  describe("Burn", function () {
    it("Burn test", async () => {
      const balance = await token.balanceOf(owner.address);
      await token.approve(owner.address, 200);
      await token.burn(owner.address, 100);
      expect(await token.balanceOf(owner.address)).to.equal(balance.sub(100));
    });
  });

  describe("Allowance", function () {
    it("Should update allowance after approve", async () => {
      const allowance = await token.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(0);
      await token.approve(addr1.address, 200);

      const updatedAllowance = await token.allowance(
        owner.address,
        addr1.address
      );
      expect(updatedAllowance).to.equal(200);
    });
  });
});
