# Why Supporting Pool Ranger Is a Wise Investment

> Pool Ranger asks for ADA donations to fund continued development.  
> This document explains why this is one of the highest-return decisions a Cardano delegator can make.

---

## 1. The Tools Already Pay You Back — Today, Before Pool Ranger Even Launches

You do not have to wait for the Pool Ranger smart contract to go live to start earning a return on a donation.
The interactive tools published by Pool Ranger are free, open to everyone, and already produce real ADA gains for any delegator who uses them.

**Consider what these tools do for you right now, at zero cost:**

- **[SPO and Delegator Reward Analysis — Interactive Chart](https://johnshearing.github.io/pool_ranger/SPO_REWARD_ANALYSIS_CHART.html)**
  Type the ticker of the pool you currently delegate to. The chart pulls live data from the Cardano blockchain and shows you exactly what your pool is earning, what its margin is doing to your returns, and where your ROA falls on the saturation curve. Most delegators have never seen their pool's economics laid out this clearly. Many discover within thirty seconds that they are leaving 1% to 3% annual return on the table — every year, on every ADA they hold.

- **[Pool Switch Calculator](https://johnshearing.github.io/pool_ranger/POOL_SWITCH_CALCULATOR.html)**
  Tells you whether moving your delegation to a better pool is worth the transaction friction, and how many epochs until the switch pays for itself. No more guessing.

- **[Pool Viewer: View and Analyze All Pools](https://johnshearing.github.io/pool_ranger/epoch_agent/epoch_report_viewer.html)**
  A ranked, sortable, filterable view of every stake pool in the ecosystem with the parameters that actually matter for delegator returns. The pools that consistently rise to the top of this list are the ones currently underpaying their operators and overpaying their delegators. That is exactly where your stake belongs.

- **[Latest Epoch Reporting Data](https://github.com/johnshearing/pool_ranger/tree/main/epoch_agent/reports)**
  Look here for the latest raw data that feeds the Pool Viewer. At the very top of the report is a list of what pools changed Fee, Margin, or Pledge since the last epoch. This information is also available from the Pool Viewer by setting a filter.  

- **[CIP: Utilization Scaled Pledge Bonus — The Multi-Pool Buster](https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html)**  
  This is a proposed protocol improvement that would push more reward to single-pool operators who actually pledge their own ADA.  
  Whether or not it is adopted, the analysis behind it helps you understand which operators are already aligned with sound economic incentives.  
  The CIP is about changing the way pledge bonus is calculated to include the effect of how much delegation a pool has.  
  The effect is to support honest pools and penalize multipool operators without lowering Sybil resistance of the protocol.  
  If you look at a typical Single Pool Operator [using the simulator](https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html) you will see there is little or no difference when using the current calculation of pledge bonus or the proposed calculation.  
  Only pools that have pledge but no delegation (typically multi-pools) are punished.  
  Also, currently the protocol is actually working against filling honest pools with delegation.  
  This is because with many combinations of fee, margin, and pledge, ROA actually goes down as delegation rises.  
  In these cases, SPOs and Delegators are actually penalized for adding delegation! You can see this in the simulator.  
  The CIP fixes this with one small change in how the pledge bonus is calculated.  
  In any case, Pool Ranger has no pony in this race. Pool Ranger gets the highest possible ROA for its members no matter how the pledge bonus is calculated.    
  The only reason I know about the issue is because Pool Ranger developed software that allows us to pick good stake pools and avoid the bad.  
  All of that software is now open sourced and listed above.  
  In any case, the problem with pledge calculation that favors multipool operators and discourages delegation to honest pools showed itself in the software so I wrote a CIP about it.  
  **Note:** Using the term Honest Pool when talking about Single Pools implies that Multi-Pools are not honest. Here is why most Multi-Pools do not meet the honesty criteria: While currently the protocol does not incentivize the behavior, the intention of the protocol creators is that SPOs will provide a place for delegators to earn a fair reward for staking. Multi-Pools with lots of delegation are meeting at least that objective, and these pools will be unaffected by the proposed change. But Multi-Pools with little delegation are collecting fees for each pool, and a pledge bonus too, every epoch without providing that service. These are the pools that will lose income from the change proposed in this CIP. 


**The math is straightforward.** If a single one-hour session with these tools moves you from a mediocre pool to a well-parameterized one, the additional staking rewards over the next year will dwarf any reasonable donation. On a 10,000 ADA delegation, even a 1% ROA improvement is 100 ADA per year — every year, compounding, for as long as you hold ADA.

A donation today is not money spent. It is money returned, many times over, by the tools that are already in your hands.

---

## 2. Pool Ranger Itself Is Designed to Return Funds to Members

The free tools find the best pool *at one moment in time*. Pool Ranger does this **every epoch, automatically, forever**, and splits the rewards on-chain:

- **You receive ≥ 99%** of staking rewards.
- **The administrator receives ≤ 1%** as a management fee.
- **The smart contract enforces the split.** No trust is required.

For the typical delegator who set their pool once years ago and never revisited it, joining Pool Ranger captures a recurring yield improvement of 1% to 5% per year. The 1% management fee is a small fraction of the gain Pool Ranger captures for you. The other 99% is yours.

Donating now supports the project that will be sending you those rewards. The donation is, in effect, a tiny prepayment on a service that has been engineered from the ground up to pay you back.

---

## 3. Open Source Is Your Guarantee That Rates Stay Low

Here is the part most donors miss — and it is the most important part.

**All of Pool Ranger's code is open source.** The Aiken smart contracts, the off-chain scripts, the interactive tools, the analysis, the documentation. Every line is published, auditable, and free to copy.

This means that the moment Pool Ranger raises its fees, or slips on pool selection, or treats members poorly, **anyone in the world can fork the codebase and launch a competitor that undercuts it.** Setting up a competing service does not require inventing the technology. The technology already exists, written and tested, sitting in a public repository.

This is not a weakness. It is the entire point.

Most staking services on Cardano are closed, opaque, and trust-based. Their fees can rise. Their pool choices can quietly drift toward whoever pays them the largest kickback. You have no leverage over them except to leave, and even leaving is often friction-laden.

Pool Ranger is the opposite. Because the code is open:

- **A competitor can appear at any time.** Pool Ranger must keep its 1% management fee competitive or risk losing members to a fork that charges 0.9%, or 0.5%, or 0%.
- **Members can verify the smart contract.** No surprises. No back-doors. No "trust us."
- **The community owns the floor.** If Pool Ranger ever stops serving members well, the code itself becomes the basis for whatever replaces it.

In short: by making Pool Ranger open source, the project has voluntarily handed delegators a permanent lever to keep fees low and quality high. The competitive pressure created by openness is structural. It does not depend on the goodwill of the administrator. It is enforced by the existence of the code itself.

**Donating to Pool Ranger is therefore safer than donating to a closed service.** With a closed service, you are betting on the operator's honor. With Pool Ranger, you are betting on a system that cannot drift far from members' interests without immediately calling competitors into existence.

---

## 4. What Your Donation Funds

- Continued development of the Plutus V3 smart contracts.
- The web UI for members and the admin dashboard (Phase 2).
- Autonomous epoch-boundary pool selection and reward distribution (Phase 3).
- Ongoing maintenance of the free interactive tools that already help thousands of delegators.
- The research and writing — the CIP proposals, the reward analysis, the documentation — that makes the whole Cardano staking economy more transparent.

Every ADA contributed accelerates the moment when Pool Ranger goes live and starts returning 99% of maximized staking rewards to its members.

---

## 5. The Bottom Line

- **The tools already pay back the donation.** Use them once on your existing delegation and the math works out in your favor.
- **The service will pay back the donation again.** 99% of maximized rewards, forever, with on-chain enforcement.
- **The open-source design keeps rates low.** Any drift from members' interests immediately invites a forked competitor using the same code.

A donation to Pool Ranger is not a gift. It is an early position in a service that has been engineered, mathematically and structurally, to return value to the people who use it.

---

## Donate
```
addr1q9m7zdhxm7ecp560nyl7rnl2xstajnx0s96ppwfcv0upawzwfv6fkds3r7tagww4hq5ruz49jknfjaz5ujdch3gyng5qkhxd5v
```
Thank you for supporting the work. The next epoch is always coming. Let's make it a profitable one for everyone.
