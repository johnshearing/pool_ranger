# Pool Ranger

> **Status: Under Construction** — This project is actively being developed and is not yet ready for use.

---

## What Is Pool Ranger?

Pool Ranger is a Cardano staking cooperative built on Plutus V3 smart contracts.  
Members delegate their stake to the cooperative, which pools that delegation to carefully chosen stake pools for maximum return.  
Rewards destributed at the end of every epoch.  

The key insight: **You never give up control of your ADA.**  
You only share your stake credential — never your spending key.  
You can leave the cooperative and withdraw all rewards without asking permission.  

---

## Problems Pool Ranger Solves for delegators

### 1. Sticky Stake
ADA holders tend to delegate to a stake pool and then forget about it without ever checking on stake pool performance.  
The result is almost certainly suboptimal performance of their investment.  

**Pool Ranger tracks stake pool performance and constantly moves delegation for the greatest possible return.** 


### 2. Small ADA Holders Don't Have Access To The Best Performing Stake Pools

A more consistent and higher return is acquired by delegating to large stake pools that are near staturation.  
That's because small stake pools with little delegation are much less likely make blocks at every epoch.  
Furthermore, the Fixed Fee of 340 ADA which all pools take right off the top at the end of every epoch is large bite out of the returns that small pool delegators will recieve at the end of each epoch.  
On the other hand, the 340 ADA Fixed Fee is only as small nibble out of the shared returns that large pool delegators will receive.  

But larger pools typically charge a higher margin than small pools with lower saturation.  
This reduces returns to delegators.  
Some of these pools charge a 100 percent margin which means none of the rewards are shared with delgators.  
These are effectivly private stake pools and all the returns go to the whales that fund them.  

So small pools do not produce high returns.  
Larger pools earn more but typically the owners keep the extra gains rather than passing them on to the delgators. 


**Pool Ranger is a coopertive with enormous delegating power.  
That means we can delegate to small high performing stake pools that take little or no margin.  
This brings the stake pool to near staturation levels, same as the whale pools, which boosts their returns and distributes them equitably to the delegators.  
Pool operators are incentivized keep their own margins low in order to keep Pool Ranger delegation.**    


### 2. Large pools get over-saturated

When too much ADA piles into one pool, rewards decline for everyone.  

**Pool Ranger prevents this by giving each member a unique parameterized stake script — so the administrator can delegate each
member's stake to a *different* pool independently, spreading the load and maximizing yields.**  


### 3. You can't trust a cooperative that holds your funds

Traditional staking services require you to send your ADA to an address they control.  

**With Pool Ranger no trust is required. We don't hold your funds.    
Your private keys remain in your possession at all times.  
Only the stake credential is shared with the cooperative.  
The smart contract cannot lock or move your funds.   
You can spend your ADA any time you like.  

The `publish` handler lets **either** the admin **or** the member deregister the cooperative stake credential.  
You never need the administrator's permission to leave.  
You can withdraw your delegation and leave the cooperative at any time.**

### 4. Staking Rewards Are Distributed Weekly 

**Pool Ranger's withdraw handler enforces the fee split on-chain:**
- Admin-initiated withdrawal: admin keeps 1%, member receives ≥ 99%.  
  - Admin has one epoch to distribute staking rewards and collect the 1% manangement fee.  
- Member self-withdrawal: member receives 100% — no admin fee at all.  
  - After one epoch, if the rewards have not been distrubuted then the delegator can claim 100% of the staking rewards and the admin forfits the 1% fee.  

**No trust required. The smart contract enforces the rules.**



## Problems Pool Ranger Solves For The Community

### 1. Sticky Stake: Supporting Stake Pool Operators That Do Extra For the Cardano Community

Indivdual ADA holders tend to delegate to a stake pool and then forget about it without ever checking if the stake pool is continuing to act in the best interests of the community according to the ideals of the Pool Ranger membership. 

**Pool Ranger looks very carefully at the behaviour of stake pool operators and only delegates to those that perform well. Extra consideration is given to those stake pool operators that do extra for the Candano community. We notice those that write software and develop the protocol, participate in good governance, spread knowledge, maintain a single stake pool (no multipool operators) and solicit for new Cardano communtity members.**  

**On chain governance ([Bemocracy](https://github.com/johnshearing/beemocracy/blob/main/Beemocracy2.0.md)) ensures that all members can participate in stake pool selections.**  


### 2. Increase Decentralization by Supporting New Stake Pool Operators

The more stake pool operators we have in the Cardano ecosystem the more decentralized, secure, and valuable the Cardano protocol becomes.  
The biggest difficulty facing new new stake pool operators is finding delegation.  
We will activly look for and delegate to new SPOs that are running their pools reliably.  
This will attract more SPOs to our protocol.   


### 3. Give A Political Voice To Small ADA Holders While Achieving The Best Possible Returns For Our Members.

By pooling our delegation, small ADA holders can have big influence on stake pool operators and DReps



---

## How It Works (Overview)

1. **Join:** Generate your personal cooperative address — a standard Cardano address that uses
    **your own spending key** (so you keep full control over spending) paired with the cooperative
    stake script (so the administrator can delegate your stake to the best pool). Then send your ADA
    to this new address. This is the only way Cardano allows a third party to control delegation on
    your behalf: the staking credential of your address must be the cooperative script. Your ADA never
    goes to a shared pool — it lives at an address that only you can spend from.
2. **Delegate:** The administrator delegates your unique stake address to a chosen pool.
3. **Earn:** Rewards accumulate at your stake address.
4. **Withdraw:** The administrator pushes rewards to you (keeping 1%), or you withdraw 100%
   yourself after the admin's 1-epoch window expires.
5. **Leave:** Deregister your cooperative stake credential at any time — admin or member can do this.

---

## Project Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Aiken smart contract + CLI scripts (`.mjs`) for all cooperative operations | In progress |
| 2 | Web UI for members (CIP-30 wallet connect) and admin dashboard | Planned |
| 3 | Claude Code automation — autonomous pool selection, epoch-boundary delegation, reward distribution, solicitation for new members | Planned |

---

## Resources

- [Aiken language](https://aiken-lang.org)
- [MeshJS SDK](https://meshjs.dev/)
- [Cardano staking documentation](https://docs.cardano.org/about-cardano/evolution/staking-and-delegating)
