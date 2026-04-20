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

### 4. Staking Rewards Are Distributed Automatically 

**Pool Ranger's withdraw handler enforces the fee split on-chain:**
- Either the admin **or** the member can initiate a reward withdrawal at any time.  
- Admin always receives ≤ 1% of the withdrawal amount as a management fee.  
- Member always receives ≥ 99% of the withdrawal minus the transaction fee.  
- The transaction fee is paid from the rewards themselves — neither party needs extra ADA on hand to run a distribution.  

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

### Understanding Your Cooperative Address

Every Cardano address has two parts:
- A **spending credential** — controls who can send your ADA. Only the holder of your private key can do this.
- A **staking credential** — controls which stake pool earns rewards on your behalf.

Normally both parts come from the same wallet. Pool Ranger creates a special address for you where:
- The **spending credential** is still your own key — only you can ever send your ADA.
- The **staking credential** is the cooperative script — this lets the administrator delegate your stake to the best pools on your behalf.

This is the only way Cardano allows a third party to manage delegation for you.  
Because the staking credential must be part of your address, you do need to send your ADA to your new cooperative member address.  
But your ADA never enters cooperative custody — no one else can spend it.

---

### Step-by-Step Member Flow

**1. Join**  
Pool Ranger generates a unique **cooperative member address** for you. It is a standard Cardano address built from your own wallet's payment key (your spending control) combined with the cooperative stake script (the administrator's delegation control). You send your ADA to this address. It is exclusively yours to spend — the administrator cannot touch it.

**2. Register**  
The cooperative stake credential is registered on-chain. This requires a refundable 2 ADA deposit, which is returned to you when you leave the cooperative. Registration is what ties your address into the cooperative's delegation system.

**3. Delegate**  
The administrator delegates your stake to the best available pool. Each member's stake is delegated independently, so you may be assigned to a different pool than other members. This prevents any one pool from becoming over-saturated, which would reduce returns for everyone.

**4. Earn**  
Staking rewards accumulate at your **stake address** — a separate on-chain account linked to your cooperative stake credential. Rewards do not appear in your ADA balance; they live at the stake address until they are withdrawn. See *Viewing Your Rewards* below.

**5. Withdraw**  
- Either you or the administrator can withdraw accumulated rewards at any time.  
- The administrator always receives ≤ 1% as a management fee; you always receive ≥ 99% minus the small transaction fee.  
- The transaction fee is paid from the rewards themselves — you do not need extra ADA in your wallet to initiate a withdrawal.  
- The smart contract enforces these rules. No trust is required.

**6. Leave**  
Either you or the administrator can deregister the cooperative stake credential at any time. Your 2 ADA deposit is returned to you. Your ADA stays at your cooperative member address and remains yours to spend whenever you like.

---

### Spending Your ADA While Staked

You never lose access to your ADA. Spending a UTxO only requires satisfying the **spending credential** — your private key. The cooperative stake script plays absolutely no role in spending transactions. As far as Cardano is concerned, sending ADA from your cooperative address is identical to sending from any other address you own.

- **Phase 1 (current):** Use Pool Ranger's CLI scripts to build and sign spending transactions. If you use a Ledger hardware wallet, the device signs exactly as it would for any ordinary Cardano address — it sees a normal transaction that requires your payment key, nothing more.
- **Phase 2 (planned):** The Pool Ranger web UI will let you connect your CIP-30 wallet (e.g. Eternl) and spend directly from your cooperative address in the browser.

> **Important note for hardware wallet users:** Most hardware wallet companion apps (such as Ledger Live) derive and display only addresses where both the spending key *and* the staking key come from your device's seed phrase. Your cooperative address uses a script for the staking credential instead of your device's staking key, so it will not appear in your hardware wallet's normal address list or balance display. You will use Pool Ranger's interface — CLI in Phase 1, web dashboard in Phase 2 — to view your balance and initiate transactions.

---

### Viewing Your ADA Balance

Your ADA balance is the total ADA sitting in UTxOs at your cooperative member address. It does not include unclaimed staking rewards (those are at a separate stake address — see below).

- **CLI (Phase 1):** Run `node _view_wallet_balances.mjs` — this queries your cooperative address via Blockfrost and prints your current ADA balance.
- **Web UI (Phase 2):** Your balance will be shown on your member dashboard whenever you log in.
- **Cardano explorer:** You can look up your cooperative member address directly on [cardanoscan.io](https://cardanoscan.io) (use Preview testnet for testing) to see every UTxO it holds.

---

### Viewing Staking Rewards Not Yet Distributed

Cardano holds accumulated staking rewards in a **rewards account** linked to your stake credential. This is entirely separate from your ADA balance — rewards do not appear in your wallet until they are explicitly withdrawn to your address.

To see rewards that have built up but not yet been sent to you:

- **CLI (Phase 1):** `node _view_wallet_balances.mjs` queries your stake address reward balance via Blockfrost and displays it alongside your ADA balance.
- **Web UI (Phase 2):** Your pending rewards will appear on your member dashboard next to your wallet balance.
- **Cardano explorer:** Look up your **stake address** (it begins with `stake_test1...` on Preview testnet) on [cardanoscan.io](https://cardanoscan.io). The explorer shows the full reward balance that has accumulated but not yet been withdrawn. Pool Ranger's CLI prints your stake address when you run `_view_wallet_balances.mjs` so you always know where to look.

---

## Project Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Aiken smart contract + CLI scripts (`.mjs`) for all cooperative operations | In progress |
| 2 | Web UI for members (CIP-30 wallet connect) and admin dashboard | Planned |
| 3 | Claude Code automation — autonomous pool selection, epoch-boundary delegation, reward distribution, solicitation for new members | Planned |

---

## Resources

- [The Pool Ranger Specification, Roadmap, and ToDo List](https://github.com/johnshearing/pool_ranger/blob/main/REQUIREMENTS.md)
- [Aiken language](https://aiken-lang.org)
- [MeshJS SDK](https://meshjs.dev/)
- [Cardano staking documentation](https://docs.cardano.org/about-cardano/evolution/staking-and-delegating)
