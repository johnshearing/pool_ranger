# Pool Ranger

> **Status: Under Construction** — This project is actively being developed and is not yet ready for use.

---

## What Is Pool Ranger?

Pool Ranger is a Cardano staking cooperative built on Plutus V3 smart contracts. Members delegate
their stake to the cooperative, which pools that delegation to carefully chosen stake pools. Rewards
flow back to members automatically.

The key insight: **you never give up control of your ADA.** You only share your stake credential —
never your spending key. You can withdraw your ADA or leave the cooperative at any time without
asking permission.

---

## Problems It Solves

### 1. Solo staking doesn't pay well

Small ADA holders often wait many epochs between rewards because their stake is too small to
guarantee a slot leader win every epoch. Pooling stake with a cooperative smooths this out.

### 2. Large pools get over-saturated

When too much ADA piles into one pool, rewards decline for everyone. Pool Ranger prevents this by
giving each member a **unique parameterized stake script** — so the administrator can delegate each
member's stake to a *different* pool independently, spreading the load and maximizing yields.

### 3. You can't trust a cooperative that holds your funds

Traditional staking services require you to send your ADA to an address they control. Pool Ranger
doesn't. Your **payment credential** remains your own spending key at all times — only the
**stake credential** is handed to the cooperative script. The contract cannot lock or move your
funds. You can spend your ADA any time you like.

### 4. The administrator could keep all the rewards

Pool Ranger's `withdraw` handler enforces the fee split on-chain:
- **Admin-initiated withdrawal:** admin keeps 1%, member receives ≥ 99%.
- **Member self-withdrawal:** member receives 100% — no admin fee at all.

No trust required. The smart contract enforces the rules.

### 5. You can't leave if the admin won't cooperate

The `publish` handler lets **either** the admin **or** the member deregister the cooperative stake
credential. You never need the administrator's permission to leave.

---

## How It Works (Overview)

1. **Join:** Move your ADA to a cooperative base address. This address uses your spending key
   (so you keep full control) paired with a cooperative stake script parameterized with your key hash.
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
| 3 | Claude Code automation — autonomous pool selection, epoch-boundary delegation, reward distribution | Planned |

---

## Resources

- [Aiken language](https://aiken-lang.org)
- [MeshJS SDK](https://meshjs.dev/)
- [Cardano staking documentation](https://docs.cardano.org/about-cardano/evolution/staking-and-delegating)
