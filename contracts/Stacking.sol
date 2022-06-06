//SPDX-License-Identifier: Unlicense
pragma solidity =0.8.14;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Stacking is Ownable {

  struct PoolInfo {
    ERC20 stakeToken;
    uint256 rewardPerBlock;
    uint256 lastRewardBlock;
    uint256 accTokenPerShare;
    uint256 depositedAmount;
    uint256 rewardsAmount;
    uint256 lockupDuration;
    uint256 depositLimit;
  }

  struct UserInfo {
    uint256 amount;
    uint256 rewardDebt;
    uint256 pendingRewards;
    uint256 lastClaim;
  }

  PoolInfo[] public pools;
  mapping(address => mapping(uint256 => UserInfo)) public userInfo;
  mapping(uint256 => address[]) public userList; 

  mapping(uint256 => address) public poolRewardTokens;
  mapping(address => uint256) public restakePoolIds;

  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event Claim(address indexed user, uint256 indexed pid, uint256 amount);

  receive() external payable {}

  function addPool(
    address _stakeToken,
    address _rewardToken,
    uint256 _rewardPerBlock,
    uint256 _lockupDuration,
    uint256 _depositLimit
  ) external onlyOwner {
    poolRewardTokens[pools.length] = _rewardToken;
    pools.push(
      PoolInfo({
        stakeToken: ERC20(_stakeToken),
        rewardPerBlock: _rewardPerBlock,
        lastRewardBlock: block.number,
        accTokenPerShare: 0,
        depositedAmount: 0,
        rewardsAmount: 0,
        lockupDuration: _lockupDuration,
        depositLimit: _depositLimit
      })
      );
  }

  function updatePool(
    uint256 pid,
    address _stakeToken,
    address _rewardToken,
    uint256 _rewardPerBlock,
    uint256 _lockupDuration,
    uint256 _depositLimit
  ) external onlyOwner {
    require(pid >= 0 && pid < pools.length, "invalid pool id");
    PoolInfo storage pool = pools[pid];
    pool.stakeToken = ERC20(_stakeToken);
    pool.rewardPerBlock = _rewardPerBlock;
    pool.lockupDuration = _lockupDuration;
    pool.depositLimit = _depositLimit;
    poolRewardTokens[pid] = _rewardToken;
  }

  function updateRestakePoolId(address _token, uint256 pid) external onlyOwner {
    restakePoolIds[_token] = pid;
  }

  function emergencyWithdraw(address _token, uint256 _amount)
    external
    onlyOwner
  {
    uint256 _bal = IERC20(_token).balanceOf(address(this));
    if (_amount > _bal) _amount = _bal;

    ERC20(_token).transfer(_msgSender(), _amount);
  }

  function stake(uint256 pid, uint256 amount) external {
    _deposit(pid, amount, true);
  }

  function unstake(uint256 pid, uint256 amount) external {
    _withdraw(pid, amount);
  }

  function unstakeAll(uint256 pid) external {
    UserInfo storage user = userInfo[msg.sender][pid];
    _withdraw(pid, user.amount);
  }

  function claim(uint256 pid) external {
    _claim(pid, true);
  }

  function claimAll() external {
    for (uint256 pid = 0; pid < pools.length; pid++) {
      UserInfo storage user = userInfo[msg.sender][pid];
      if (user.amount > 0 || user.pendingRewards > 0) {
        _claim(pid, true);
      }
    }
  }

  function claimAndRestake(uint256 pid) external {
    uint256 amount = _claim(pid, false);
    address _rewardToken = poolRewardTokens[pid];
    uint256 restakePid = restakePoolIds[_rewardToken];
    _deposit(restakePid, amount, false);
  }

  function claimAndRestakeAll() external {
    for (uint256 pid = 0; pid < pools.length; pid++) {
      UserInfo storage user = userInfo[msg.sender][pid];
      if (user.amount > 0 || user.pendingRewards > 0) {
        uint256 amount = _claim(pid, false);
        address _rewardToken = poolRewardTokens[pid];
        uint256 restakePid = restakePoolIds[_rewardToken];
        _deposit(restakePid, amount, false);
      }
    }
  }

  function _deposit(
    uint256 pid,
    uint256 amount,
    bool hasTransfer
  ) private {
    require(amount > 0, "invalid deposit amount");

    PoolInfo storage pool = pools[pid];
    UserInfo storage user = userInfo[msg.sender][pid];

    require(
      user.amount + amount <= pool.depositLimit,
      "exceeds deposit limit"
    );

    _updatePool(pid);

    if (user.amount > 0) {
      uint256 pending = (user.amount * pool.accTokenPerShare)/1e12 - user.rewardDebt; 
      if (pending > 0) {
        user.pendingRewards = user.pendingRewards + pending;
      }
    } else {
      userList[pid].push(msg.sender);
    }

    if (amount > 0) {
      if (hasTransfer) {
        pool.stakeToken.transferFrom(
          address(msg.sender),
          address(this),
          amount
        );
      }
      user.amount = user.amount + amount;
      pool.depositedAmount = pool.depositedAmount + amount;
    }
    user.rewardDebt = (user.amount * pool.accTokenPerShare) / 1e12; //user.amount.mul(pool.accTokenPerShare).div(1e12);
    user.lastClaim = block.timestamp;
    emit Deposit(msg.sender, pid, amount);
  }

  function _withdraw(uint256 pid, uint256 amount) private {
    PoolInfo storage pool = pools[pid];
    UserInfo storage user = userInfo[msg.sender][pid];

    require(
      block.timestamp > user.lastClaim + pool.lockupDuration
,
      "You cannot withdraw yet!"
    );
    require(user.amount >= amount, "Withdrawing more than you have!");

    _updatePool(pid);  

    uint256 pending = (user.amount * pool.accTokenPerShare) / 1e12  - user.rewardDebt;
    
    if (pending > 0) {
      user.pendingRewards = user.pendingRewards + pending;
    }

    if (amount > 0) {
      pool.stakeToken.transfer(address(msg.sender), amount);
      user.amount = user.amount - amount;
      pool.depositedAmount = pool.depositedAmount - amount;
    }

    user.rewardDebt = user.amount * pool.accTokenPerShare / 1e12;
    user.lastClaim = block.timestamp;
    emit Withdraw(msg.sender, pid, amount);
  }

  function _claim(uint256 pid, bool hasTransfer) private returns (uint256) {
    PoolInfo storage pool = pools[pid];
    UserInfo storage user = userInfo[msg.sender][pid];

    _updatePool(pid);

    uint256 pending = (user.amount * pool.accTokenPerShare) / 1e12  - user.rewardDebt;
    uint256 claimedAmount = 0;
    if (pending > 0 || user.pendingRewards > 0) {
      user.pendingRewards = user.pendingRewards + pending;
      if (hasTransfer) {
        claimedAmount = safeRewardTokenTransfer(
          pid,
          msg.sender,
          user.pendingRewards
        );
      } else {
        claimedAmount = user.pendingRewards;
      }
      emit Claim(msg.sender, pid, claimedAmount);
      user.pendingRewards = user.pendingRewards - claimedAmount;
      pool.rewardsAmount = pool.rewardsAmount - claimedAmount;
    }
    user.rewardDebt = user.amount * pool.accTokenPerShare / 1e12;
    return claimedAmount;
  }

  function _updatePool(uint256 pid) private {
    PoolInfo storage pool = pools[pid];

    if (block.number <= pool.lastRewardBlock) {
      return;
    }
    uint256 depositedAmount = pool.depositedAmount;
    if (pool.depositedAmount == 0) {
      pool.lastRewardBlock = block.number;
      return;
    }
    uint256 multiplier = block.number - pool.lastRewardBlock;
    uint256 tokenReward = multiplier * pool.rewardPerBlock;  //сколько надо еще начислить
    pool.rewardsAmount = pool.rewardsAmount + tokenReward;  //общая сумма
    pool.accTokenPerShare = (tokenReward * 1e12) / depositedAmount + pool.accTokenPerShare;
    pool.lastRewardBlock = block.number;
  }

  function safeRewardTokenTransfer(
    uint256 pid,
    address to,
    uint256 amount
  ) private returns (uint256) {
    PoolInfo storage pool = pools[pid];
    ERC20 _rewardToken = ERC20(poolRewardTokens[pid]);
    uint256 _bal = _rewardToken.balanceOf(address(this));
    if (amount > pool.rewardsAmount) amount = pool.rewardsAmount;
    if (amount > _bal) amount = _bal;
    _rewardToken.transfer(to, amount);
    return amount;
  }

  function pendingRewards(uint256 pid, address _user)
    external
    view
    returns (uint256)
  {
    PoolInfo storage pool = pools[pid];
    UserInfo storage user = userInfo[_user][pid];
    uint256 accTokenPerShare = pool.accTokenPerShare;
    uint256 depositedAmount = pool.depositedAmount;
    if (block.number > pool.lastRewardBlock && depositedAmount != 0) {
      uint256 multiplier = block.number - pool.lastRewardBlock;
      uint256 tokenReward = multiplier * pool.rewardPerBlock;
      accTokenPerShare = (tokenReward * 1e12) / depositedAmount + accTokenPerShare;
    }
    return
      (user.amount * accTokenPerShare) /  1e12 - user.rewardDebt + user.pendingRewards;
      
  }

  function getPoolCount() external view returns (uint256) {
    return pools.length;
  }

}