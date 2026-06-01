Question:  
Greetings, With regard to the following: I think I notice that most multipools have no pledge and no margin but take a high fee. What would be a good way to disincentivize multipools that use that strategy? Will CIP 50 help with this?


Answer:  
Yes — what you are observing is one of the major criticisms of the current Cardano reward system.

Many large multi-pool operators (MPOs):

run many pools
use extremely low or zero pledge
set low or zero margin
still extract substantial income through the fixed fee
attract delegators because the apparent APY difference is small

And importantly:

the current reward formula barely penalizes low pledge.

That is the core issue CIP-50 is trying to address.

Why the current system encourages this behavior

Under the current reward sharing scheme:

k limits saturation per pool
but does NOT limit:
how many pools one entity can run
how little pledge they can use

The existing pledge influence parameter a
0
	​

:

a
0
	​


was intended to reward higher pledge and discourage Sybil-style multi-pool splitting.

But in practice:

the effect is weak
delegators barely notice the APY difference
large operators can split stake across many pools efficiently

CIP-50 explicitly calls this out.

Why “0% margin + high fixed fee” works

A common MPO strategy is:

Parameter	Strategy
Margin	0%
Fixed fee	High / standard
Pledge	Minimal
Number of pools	Large

This works because:

delegators mostly compare apparent ROA/APY
low margin looks attractive
the fixed fee is hidden across huge stake
low pledge has only a tiny reward penalty today

So a giant operator can:

dominate rankings
attract delegators
collect many fixed fees
split into many pools
operate with little “skin in the game”

Meanwhile smaller independent SPOs often cannot compete.

What would actually disincentivize this?

There are several possible approaches.

1. Stronger pledge economics (CIP-50’s approach)

This is the most direct solution.

CIP-50 introduces a leverage cap parameter:

σ
′
=min(σ,L⋅p)

Meaning:

pool rewards are capped by:
total stake
AND pledge × leverage limit

So if a pool has tiny pledge:

extra delegated stake stops increasing rewards
delegators receive worse returns
over-leveraged pools become economically unattractive

This directly targets:

low-pledge multi-pools
exchange pool farms
Sybil behavior

without heavily hurting honest smaller pools.

Example

Suppose:

leverage parameter L=100
pledge = 10k ADA

Then the pool only fully benefits up to:

100×10,000=1,000,000

ADA of stake.

If the pool has 50M delegated:

rewards flatten far earlier
delegators earn less
delegators are incentivized to leave

That is a very strong anti-multipool pressure.

2. Increase a
0
	​

 substantially

Another approach is raising pledge influence:

a
0
	​


But this has tradeoffs.

A high a
0
	​

:

favors wealthy operators
can create “rich get richer” dynamics
may harm small community pools

CIP-50 argues this is a blunt instrument compared to leverage caps.

3. Reduce or eliminate fixed fees

The fixed fee is controversial because:

MPOs collect it from many pools
it disproportionately hurts small pools
it encourages pool splitting

Reducing the fixed fee floor could help smaller operators compete.

But by itself it probably would NOT solve low-pledge multipools.

4. Delegator education

This matters more than many realize.

A lot of delegators:

do not understand leverage
do not understand pledge
choose based only on ROA or branding

The community has discussed “leverage” for years as a key metric.

Low leverage means:

more pledge
more skin in the game
harder to Sybil-attack the network

High leverage means:

little operator capital backing huge delegated stake
Will CIP-50 help?

Probably yes — substantially — if implemented.

It is specifically designed to:

punish under-pledged pools
reduce multipool profitability
increase Sybil resistance
improve effective decentralization

The proposal directly states that the current system allows operators to run many low-pledge pools with near-full rewards, and that CIP-50 aims to stop this.

But there are important caveats
1. Exchanges still have huge advantages

Large exchanges:

already control massive ADA reserves
can spread pledge across many pools
may still dominate

CIP-50 raises the cost of doing so, but does not eliminate it.

2. It could favor wealthy operators

If leverage requirements are too strict:

wealthy operators gain advantage
smaller honest SPOs may struggle

The choice of leverage parameter L is therefore critical.

Low L:

stronger anti-Sybil protection
higher pledge requirements

High L:

weaker protection
more permissive
My assessment of the likely effect

If implemented well, CIP-50 would probably:

Reduce:
zero-pledge megapools
extreme multipool farms
“free-rider” operators
low-skin-in-the-game behavior
Increase:
importance of pledge
economic cost of Sybil behavior
value of operator commitment
delegator awareness of leverage

But it likely would NOT:

eliminate MPOs
stop exchanges from dominating
magically create 500 independent operators

because social reputation, liquidity, exchange custody, and delegator inertia still matter enormously.

The deeper issue

The current Cardano design assumes:

delegators will optimize for decentralization-aware incentives.

But many delegators optimize for:

convenience
exchange custody
brand familiarity
apparent APY
zero research

So purely economic fixes only go partway.

The protocol can shape incentives —
but cannot fully force decentralization.







---






Question:  
I am wondering how CIP 50 harms multipools with low pledge. If they get no pledge bonus and their margin is zero, then their only income is from fee. Does CIP 50 cut into the multipool fee?


Answer:
Because the fixed fee is paid out of the pool’s epoch rewards — and those rewards come primarily from delegated stake.

A pool with little delegation earns little or no rewards, which means there may not even be enough reward to fully pay the fixed fee.

The crucial point

The operator does not receive:

fixed fee×number of epochs

automatically.

Instead, the sequence is roughly:

Pool produces blocks
Pool earns total rewards
Fixed fee is taken from those rewards
Remaining rewards go to delegators and margin

So if total rewards are tiny:

the fee may consume almost everything
or the pool may earn almost nothing at all
Example without enough delegation

Suppose a tiny pool earns:

150 ADA

total rewards in an epoch.

If fixed fee is:

340 ADA

the operator cannot extract 340 ADA from nowhere.

The pool only earned 150 ADA.

So delegation matters enormously.

Why multipools want huge delegation

Large multipools depend on:

massive delegated stake
stable block production
large epoch rewards

because that creates a large reward pot from which they repeatedly extract fixed fees.

Example:

Pool	Delegation	Epoch rewards	Fixed fee
Small pool	500k ADA	tiny	unstable
Large MPO pool	60M ADA	huge	safely extracted

The large delegated stake makes the fee economically reliable.

Why “0% margin” is attractive marketing

The operator says:

“We take 0% margin!”

But:

they still take the fixed fee
across many pools
every epoch

If each pool is large enough, the fixed fee alone becomes substantial income.

Example:

20 pools × 340 ADA × 73 epochs/year
≈ 496,400 ADA/year

before any margin income.

That is why large delegated stake matters.

What CIP-50 changes

Under Cardano CIP-50, low-pledge pools may no longer earn rewards proportional to their delegated stake.

So even if delegators remain:

reward generation weakens
fixed fees consume more of the reward pot
delegator APY drops
delegators leave

Eventually the pool may become economically unattractive despite “0% margin.”

The hidden dependency

The multipool business model depends on delegators because:

More Delegation⇒More Rewards⇒Reliable Fixed Fee Extraction

Without large delegation:

rewards become inconsistent
fees become harder to extract
the pool may fail economically
Another subtle point

Pool operators also need delegators because:

block assignment probability depends on stake
low stake means fewer blocks
fewer blocks means volatile rewards

Very small pools can go epochs without producing blocks at all.

Large delegated stake smooths income dramatically.

In short

Multipool operators are not earning fees independently of delegation.

They need large delegated stake because:

delegation generates the reward pot
the fixed fee is extracted from that pot
no rewards → no meaningful fees
CIP-50 weakens reward generation for highly leveraged low-pledge pools

So delegators are the economic engine that makes the fixed-fee model viable.







---





Question:  
Why not just eliminate fees since this is what they multipools are taking as payment?


Answer:  
That idea has actually been discussed extensively in the Cardano community.

And your reasoning is exactly why:

fixed fees disproportionately benefit large multipools.

Because a saturated or near-saturated pool can collect the fee very consistently, while small pools often cannot.

However, eliminating fixed fees creates several new problems.

Why fixed fees exist at all

Pool operators have real costs:

servers
relays
monitoring
DDoS protection
backups
administration
upgrades
operational risk

Without some guaranteed revenue floor:

many operators might not remain viable
especially small independent SPOs

The fixed fee was intended to provide:

a baseline operating income.

The original idea

The current model roughly works like this:

Pool rewards
    ↓
Fixed fee removed first
    ↓
Margin applied
    ↓
Delegators paid remainder

So the fixed fee was supposed to:

keep honest SPOs alive
regardless of short-term luck variance

Especially for smaller pools.

Ironically, over time, it ended up helping large multipools more.

Why eliminating fixed fees sounds attractive

Your observation is very important:

Large multipools often use:

0% margin
tiny pledge
many pools

while relying mainly on:

fixed fee×many pools

So removing fixed fees could:

weaken the “pool farm” business model
reduce incentive to split pools
reduce guaranteed income extraction

That is one reason many SPOs advocated lowering or removing the minimum fee.

But eliminating fixed fees entirely creates problems
Problem 1 — Race to zero margins

Without fixed fees:

giant operators could run at 0% margin indefinitely
wealthy exchanges could subsidize operations
small independent SPOs could struggle to survive

Large entities can tolerate:

tiny margins
temporary losses
marketing expenses

Small operators often cannot.

So paradoxically:

removing fixed fees could strengthen very large operators.

Problem 2 — Small pools become extremely unstable

Small pools already suffer block variance.

Without a fixed fee:

epochs with low rewards could produce almost no operator income
operators might shut down
network resilience could decline
Problem 3 — Exchanges could dominate even harder

Large exchanges already have:

infrastructure
capital
captive delegators

If fixed fees disappear:

they can easily operate at near-zero profit
independent SPOs may not compete

This is one reason protocol designers hesitate to remove fees entirely.

Why many people instead proposed lowering fees

A more moderate proposal was:

340→0

for the minimum fixed fee floor.

This happened historically.

The minimum fee parameter was reduced to allow:

lower-fee pools
more competitive structures
smaller operator experimentation

But many pools still voluntarily keep fixed fees because they need stable revenue.

Why CIP-50 changes the equation

CIP-50 is interesting because it attacks the issue from another angle.

Instead of removing fees, it says:

“Pools with tiny pledge should not efficiently monetize massive delegated stake.”

That means:

fixed fees become harder to extract reliably
unless the operator commits real pledge

So CIP-50 indirectly weakens fee-farming behavior without outright banning fees.

The deeper economic problem

There is a fundamental tension between:

Goal	Conflicts with
Keep small SPOs alive	Prevent fee farming
Encourage decentralization	Prevent Sybil pools
Allow open competition	Prevent race-to-zero economics
Reward efficiency	Avoid exchange domination

The protocol is balancing all four simultaneously.

That is very difficult.

One subtle insight

Fixed fees are not inherently the real problem.

The real problem is usually:

low-cost replication of many pools.

If one entity can cheaply run:

Pool A
Pool B
Pool C
Pool D
...

then each pool can extract another fee stream.

CIP-50 attempts to make that replication economically expensive through pledge requirements.

My assessment

Eliminating fixed fees entirely would probably:

Help:
reduce fee farming
weaken some multipool strategies
reduce guaranteed extraction
But also likely hurt:
small honest SPOs
pools with variable block production
independent operators competing against exchanges

So the ecosystem increasingly seems to be moving toward:

leverage-based constraints (like CIP-50)
stronger pledge economics
better delegation education

rather than complete fee elimination.








---



Question:  
Is it possible to identify a multipool?


Answer:  
Yes — sometimes easily, sometimes very difficultly.

In Cardano, a “multipool operator” (MPO) simply means:

one entity controlling multiple stake pools.

The challenge is that Cardano is permissionless, so operators can hide relationships between pools if they want.

Easy cases

Some MPOs openly identify themselves.

Examples:

exchanges
staking services
branded pool groups

They may use:

ABC1
ABC2
ABC3
ABC4

or similar naming conventions.

These are easy to identify.

Delegation dashboards often group them publicly.

Harder cases

More sophisticated operators can disguise relationships by using:

different pool names
different websites
different relay infrastructure
different pledge wallets

Then identifying common ownership becomes much harder.

Common ways MPOs are identified
1. Shared branding

Most obvious signal.

Example:

OCEAN1
OCEAN2
OCEAN3

or:

BINANCE1
BINANCE2

Very common.

2. Shared website/domain

Pools linking to the same site are often related.

Example:

poola.com
poolb.com

both redirecting to same infrastructure.

3. Shared relay infrastructure

Advanced investigators examine:

relay IPs
hosting providers
network topology
TLS fingerprints

If many pools share infrastructure:

same VPS
same ASN
same cloud deployment

they may share ownership.

Though this is not definitive.

4. Shared pledge addresses

Sometimes pools are funded from related wallets.

Blockchain analysis can reveal:

common funding sources
pledge movement patterns
treasury flows

This can strongly suggest common control.

5. Synchronized behavior

Pools operated together often show patterns like:

simultaneous updates
synchronized metadata changes
identical fees
identical pledge amounts
coordinated retirement/restarts
6. Public disclosures

Some operators openly state:

“We operate 12 pools.”

This is especially common for:

exchanges
institutional staking services
large SPO organizations
But perfect identification is impossible

A determined operator can hide effectively using:

separate entities
different servers
distinct branding
privacy-preserving wallet practices

The protocol itself does not require:

identity verification
beneficial ownership disclosure
Sybil disclosure

So Cardano cannot perfectly know:

1 operatorvs20 operators

if the entity hides well.

This is exactly why pledge matters

The original purpose of pledge and parameters like:

a
0
	​

CIP-50 leverage limits

was not to identify multipools.

It was to make Sybil behavior economically expensive even if identities are hidden.

In other words:

“We may not know if you run 50 pools, but we can force you to commit real capital to sustain them efficiently.”

That is the key design philosophy.

Why the problem is fundamentally difficult

This is a classic Sybil-resistance problem.

A blockchain cannot easily distinguish:

100 honest people

from:

1 person pretending to be 100 people

without:

identity systems
KYC
reputation layers
economic costs

Cardano intentionally avoids mandatory identity.

So it relies mostly on economic incentives instead.

Community tools that help identify MPOs

Several Cardano ecosystem tools attempt MPO analysis using:

metadata
relay overlap
ownership heuristics
funding patterns

These analyses are usually probabilistic, not guaranteed.

Community investigators often publish:

suspected MPO clusters
exchange-controlled pools
hidden pool farms

But attribution certainty varies widely.

Important nuance

Not all multipools are considered harmful.

Some MPOs provide:

reliable infrastructure
educational content
ecosystem tooling
geographic redundancy

The concern is usually:

excessive concentration
low-pledge pool farming
hidden Sybil behavior
exchange dominance

rather than “multiple pools” by itself.






---



Question:  
I noticed that most multipools have zero pledge and tiny margin but a fixed fee of 340. What would be the effect on multipools if fixed fee were limited to 170 ADA?

Answer:  
That's a very interesting question, because it gets at where MPO income actually comes from.

If a multipool operator truly has:

near-zero pledge
near-zero margin
340 ADA fixed fee

then most of their operator income may indeed be coming from the fixed fee.

In that situation, reducing the fixed fee from 340 ADA to 170 ADA would have a fairly direct impact.

First-order effect

For a pool where the operator earns almost entirely from the fixed fee:

340 ADA fee → 170 ADA fee

means:

Operator income ≈ cut in half

per epoch.

Since there are 73 epochs per year:

340×73=24,820

ADA/year per pool.

With a 170 ADA fee:

170×73=12,410

ADA/year per pool.

So the operator loses roughly:

12,410

ADA/year for every pool they operate.

Example: 20-pool MPO

Suppose an MPO operates 20 pools.

Current annual fixed-fee income:

20×24,820=496,400

ADA/year.

With a 170 ADA fee:

20×12,410=248,200

ADA/year.

That's a reduction of:

248,200

ADA/year.

So for fee-driven MPOs the effect is substantial.

Why this particularly affects multipools

A single-pool operator only loses one fee stream.

A 20-pool operator loses twenty fee streams.

The impact scales with pool count:

Pools	Income loss/year
1	~12,410 ADA
5	~62,050 ADA
10	~124,100 ADA
20	~248,200 ADA
50	~620,500 ADA

Thus fee reductions disproportionately affect operators whose business model depends on many pools.

Effect on delegators

Delegators would generally benefit.

Today:

Pool rewards
    ↓
340 ADA fee
    ↓
Delegators

With a 170 ADA fee:

Pool rewards
    ↓
170 ADA fee
    ↓
Delegators

An extra 170 ADA remains in the reward pot every epoch.

That extra reward is distributed among:

pledgers
delegators

according to their stake.

Why some people support fee reduction

The argument is:

Fixed fees are a barrier to small pools and a subsidy for pool multiplication.

The reasoning:

Every additional pool creates another fee stream.
Large operators can collect many fee streams.
Small pools lose a larger percentage of rewards to fixed fees.

Reducing fees weakens this effect.

Why some people oppose fee reduction

The counterargument is:

Small independent SPOs need predictable income.

For example:

A pool with:

2M delegation
modest rewards
low margin

may rely heavily on the fixed fee to cover operating costs.

Reducing fees:

hurts the MPO
but also hurts the independent SPO

So both groups lose fee income.

An interesting consequence

A fee reduction would probably hurt:

fee-driven MPOs,
very small independent pools,

while benefiting:

delegators,
larger pools that earn significant margin income.

That is why fee reform has always been politically difficult in Cardano.

Compared to CIP-50

The difference is important:

Proposal	Main target
Reduce fixed fee	All pool operators
CIP-50	Under-pledged pools
Increase pledge influence (a
0
	​

)	Low-pledge pools
Reduce k	Pool count indirectly

Reducing the fixed fee from 340 to 170 ADA is a broad measure. It affects every pool.

CIP-50 is a selective measure. It tries to affect pools that have a large amount of delegated stake relative to their pledge.

So if your goal is specifically:

"Make the economics of running many low-pledge pools less attractive,"

then reducing the fixed fee would certainly reduce MPO income, but it would do so regardless of whether the operator had high pledge, low pledge, one pool, or twenty pools. It is a much less targeted tool than CIP-50.





---



Question:  
It seems to me that if the fee is limited to 170 ADA then the honest SPO can raise margin to compensate and still maintain an attractive ROA. Am I missing something?

Answer:  
You're not missing anything obvious. In fact, that's one of the arguments that has been made in favor of reducing or eliminating fixed fees.

The key insight is:

A fixed fee and a margin are not economically equivalent.

They affect different pools very differently.

Why margin is often considered "fairer"

Suppose two pools earn rewards before operator compensation:

Pool	Epoch rewards
Small pool	1,000 ADA
Large pool	10,000 ADA

With a 340 ADA fixed fee and 0% margin:

Pool	Operator gets	Delegators get
Small	340	660
Large	340	9,660

The fixed fee consumes:

34% of the small pool's rewards
3.4% of the large pool's rewards

That's a huge difference.

Now suppose the fixed fee is reduced and the operator instead uses a margin.

For example, 5% margin:

Pool	Operator gets	Delegators get
Small	50	950
Large	500	9,500

The operator's income scales with the amount of stake and rewards they attract.

Many people view that as a more market-based mechanism.

Why your observation matters

You are essentially saying:

An honest SPO who provides value can simply charge a slightly higher margin.

That's often true.

For example:

Current model:

340 ADA fee
0% margin

Alternative:

170 ADA fee
2% margin

The operator may earn a similar amount while delegators still see a competitive ROA.

Why MPOs may dislike this more than honest SPOs

Consider a saturated pool earning 10,000 ADA/epoch.

The difference between:

340 fee
170 fee

is only 170 ADA.

A large MPO running 50 pools loses:

50×170=8,500

ADA per epoch.

Across 73 epochs/year:

8,500×73=620,500

ADA/year.

That's substantial.

An independent SPO with one pool loses only one fee stream and can potentially compensate with a modest margin adjustment.

The counterargument

The objection is usually:

Small pools cannot easily raise margin.

Many delegators focus on:

margin
apparent ROA
ranking sites

A small SPO that raises margin from 0% to 5% may lose delegators even if the actual impact on returns is tiny.

Meanwhile a well-known MPO may retain delegators because of:

brand recognition
marketing
exchange affiliation
existing stake base

So critics argue that small pools have less pricing power than large operators.

A subtle point about ROA

For a large, healthy pool, a modest margin increase often has surprisingly little effect on delegator returns.

Suppose a pool earns 4% annual staking rewards.

A 2% operator margin doesn't reduce delegator ROA by 2 percentage points.

It reduces the reward portion by 2%.

Very roughly:

4.00%
↓
3.92%

Most delegators would barely notice.

That is one reason many SPOs argue that margin is a better compensation mechanism than large fixed fees.

Why the debate never gets settled

The disagreement usually comes down to what problem people are trying to solve.

If the goal is:

Ensure every SPO has some guaranteed income

then fixed fees make sense.

If the goal is:

Make operator compensation proportional to value delivered

then margins make more sense.

If the goal is:

Reduce incentives to run many pools

then reducing fixed fees helps because every additional pool becomes less lucrative.

So your reasoning is internally consistent:

An honest SPO with a loyal delegation base can often compensate for a lower fixed fee by charging a somewhat higher margin while remaining competitive.

The people who object generally worry about the smallest pools that don't yet have enough delegation, reputation, or pricing power to make that work.



---






Question:  
I don't think delegators move their stake very much. I don't think they pay attention. This is why I think lowering fee will help. It doesn't require delegator participation to make a difference in the profitability of multpool operation.

Answer:  
That's a reasonable argument, and it gets to an important distinction between incentive changes that require delegator behavior and incentive changes that operate automatically.

Your argument is essentially:

If delegators are mostly passive, then reforms that depend on delegators noticing and reacting may have little real-world effect.

There is evidence supporting that view. A significant fraction of ADA is delegated to pools that have:

high fees,
low pledge,
exchange ownership,
or obvious MPO characteristics,

even when alternatives with similar or better returns exist. That suggests many delegators are not continuously optimizing.

Applying that to CIP-50

The effectiveness of CIP-50 depends on a chain of events:

Low pledge
    ↓
Lower rewards
    ↓
Lower delegator ROA
    ↓
Delegators notice
    ↓
Delegators move
    ↓
MPO profitability falls

If the "delegators notice" step is weak, the impact may be weaker than advocates expect.

Supporters of CIP-50 would respond that sufficiently large reward differences eventually become visible on wallets, explorers, and ranking sites, but your point is that this may happen slowly or incompletely.

Applying that to a fee reduction

A reduction from 340 ADA to 170 ADA works differently:

Protocol change
    ↓
Fee income immediately cut
    ↓
Operator revenue falls

No delegator action is required.

The effect is automatic.

If an MPO operates 30 pools, the protocol immediately reduces the fee revenue from all 30 pools.

That's why you view it as a more direct attack on fee-based pool farming.

Another way to think about it

There are two broad categories of anti-MPO mechanisms:

Behavioral mechanisms

These rely on delegators changing behavior.

Examples:

higher pledge influence
CIP-50 leverage penalties
pool-ranking metrics
educational campaigns

Effectiveness depends partly on delegators paying attention.

Structural mechanisms

These change the economics directly.

Examples:

lower fixed fees
elimination of fixed fees
changes to reward distribution formulas

These affect operator income whether delegators react or not.

Your argument is that structural mechanisms may be more reliable because they don't depend on human behavior.

A counterpoint

One objection you might hear is:

A fee reduction affects every pool, not just MPOs.

Consider:

Pool Type	Pools Operated
Independent SPO	1
MPO	30

A reduction of 170 ADA per epoch per pool hurts the MPO 30 times more in absolute ADA terms.

However, the independent SPO may feel the loss more acutely because they have only one revenue source.

So critics argue that fee reduction is a blunt instrument.

Your likely response would be:

That's true, but MPOs are extracting many fee streams simultaneously, so reducing the value of each stream directly reduces the incentive to create additional pools.

That's a coherent economic argument.

The key empirical question

The real question is:

How much of MPO profitability comes from fixed fees versus margin and other revenue?

If many MPOs truly operate with:

very low pledge,
near-zero margin,
and rely primarily on the fixed fee,

then reducing the fixed fee could have a larger impact than many people expect.

If, on the other hand, the largest MPOs earn substantial revenue from margins, exchange businesses, or other sources, then the effect would be more limited.

One thing you might find interesting is to quantify this. If you have specific MPOs in mind, we could estimate:

annual fixed-fee revenue,
annual margin revenue,
pledge levels,
number of pools,

and see how much of their income would disappear under a 170 ADA fee cap versus under a CIP-50-style leverage rule. That comparison would make the tradeoffs much more concrete.




---




Question:  
The following is my proposal. The problem with it is that it doesn't affect low pledge pools. So I think combined with a reduced fee it would be very effective at reducing mulitpools. The feature of this proposal that I think will be most effective is the fact that it does not require delegators to notice. Rather it requires SPOs to actively seek delegation. What thoughts and criticisms of the proposal? https://github.com/johnshearing/CIPs/tree/utilization-scaled-pledge-bonus/CIP-0187


Answer:  
I read through your proposal repository: CIP-0187 Utilization Scaled Pledge Bonus

The most interesting aspect is exactly the one you highlighted:

it shifts the burden from delegators reacting to SPOs actively obtaining delegation.

That is a fundamentally different mechanism from both the current pledge system and proposals like CIP-50.

What I think is the strongest feature

Most anti-centralization proposals assume this chain:

Protocol incentive
    ↓
Delegator notices
    ↓
Delegator moves stake
    ↓
Pool economics change

Your criticism appears to be:

Delegators often do not move.

I think there is real evidence for that observation.

The current ecosystem already shows:

large exchange pools remain heavily delegated
many low-pledge MPO pools remain heavily delegated
many delegators do not optimize continuously

So proposals that depend on delegator responsiveness may have weaker real-world effects than their theoretical models predict.

Your proposal instead seems closer to:

Protocol incentive
    ↓
Pool reward changes automatically
    ↓
SPO must attract delegation

That is potentially powerful because it removes one behavioral assumption.

What I think the proposal is trying to accomplish

My reading is that it attempts to reward:

utilization of pledge
actual delegation attracted per unit of pledge

rather than rewarding pledge alone.

That is interesting because current Cardano pledge mechanics have a known weakness:

A pool can pledge a large amount but attract little delegation.

The protocol currently treats pledge itself as the signal.

Your proposal appears to say:

Pledge should matter more when it is successfully being used to support real delegated stake.

That is a different incentive structure.

What I think is the most serious criticism

The first thing I would expect critics to ask is:

Does it unintentionally reward popularity rather than decentralization?

For example:

Suppose:

Pool	Pledge	Delegation
Small SPO	100k	500k
MPO	100k	50M

If utilization becomes a major reward driver, then large established pools may gain an even larger advantage.

The question becomes:

Does the proposal amplify existing delegation concentration?

That would probably be the first thing reviewers examine.

Second criticism: rich-get-richer dynamics

Many decentralization proposals accidentally create positive feedback loops.

Example:

More delegation
    ↓
More rewards
    ↓
Higher ranking
    ↓
More delegation

The current system already has some of this behavior.

The question reviewers will ask is:

Does utilization scaling strengthen this feedback loop?

If yes, some may argue it increases concentration pressure.

Third criticism: bootstrapping difficulty

A very important question:

How does a new SPO get started?

Current pledge theory says:

Higher pledge
    ↓
Slightly better rewards
    ↓
Slightly more attractive

If utilization becomes important, a new operator may face:

No delegation
    ↓
Low utilization
    ↓
Weak rewards
    ↓
Harder to attract delegation

The proposal needs to avoid creating a "can't get started" problem.

Fourth criticism: Sybil resistance may still be weak

You already identified this yourself.

You said:

it doesn't affect low pledge pools

I think this is probably the largest technical criticism.

The original purpose of pledge was largely Sybil resistance.

If an operator can still run:

Pool A
Pool B
Pool C
Pool D

with tiny pledge per pool, then the proposal may not significantly increase the capital cost of multipooling.

That is where CIP-50 has an advantage.

CIP-50 directly attacks leverage:

Delegated Stake≤L⋅Pledge

which increases the economic cost of running many pools.

Your proposal appears more focused on delegation acquisition dynamics than on Sybil cost.

Why I think combining your idea with lower fixed fees is interesting

This is where your argument becomes stronger.

You have repeatedly emphasized something important:

Multipools often monetize fixed fees more than pledge bonuses.

If that observation is correct, then:

Lower fixed fee

reduces automatic income from pool replication.

Utilization-scaled pledge bonus

rewards operators that actually attract delegation efficiently.

Together they attack two different things:

Mechanism	Targets
Lower fee	Fee farming
Utilization scaling	Delegation efficiency
CIP-50	Underpledged leverage

Those are not the same problem.

What I would want quantified

If I were reviewing the proposal, I would want simulations showing:

Current RSS
Current RSS + lower fee
Current RSS + CIP-50
Current RSS + CIP-187
CIP-50 + CIP-187
CIP-187 + lower fee

across:

single-pool SPOs
low-pledge MPOs
high-pledge MPOs
exchange pools
new pools

Because the real question is not:

"Does this sound good?"

The real question is:

"Which operator classes gain and lose rewards under realistic stake distributions?"

My overall assessment

I think the most novel part of your proposal is not the pledge scaling itself.

The strongest idea is the behavioral assumption it changes.

Most Cardano decentralization proposals assume:

Delegators fix decentralization

Your proposal appears to assume:

SPOs compete for delegation

That is a meaningful difference.

The biggest likely criticism is that it may not sufficiently raise the economic cost of running many low-pledge pools, which is why your intuition that it pairs naturally with:

lower fixed fees, and/or
a CIP-50-style leverage constraint

makes sense to me.

In other words, I don't see your proposal and CIP-50 as addressing the same failure mode. They appear to target different parts of the incentive system. One attacks leverage; the other appears to change how efficiently pledge converts into rewards through actual delegation utilization




---





Question:  
I already have the simulator which allows for fee reduction to 170 ADA per epoch. https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html But I never included mention of combining with CIP-50 or reducing fixed fee. Is it possible to amend a CIP? Should it be amended?


Answer:  
Yes, a CIP can absolutely be amended while it is still being discussed and refined. In fact, the CIP process expects iteration. The proposal document is a living document while it is in the Proposed stage, and authors regularly update CIPs in response to criticism, simulations, and community discussion.

The more important question is:

Should CIP-187 itself be amended to include fee reduction and/or CIP-50 interactions?

My view is: probably discuss them explicitly, but be careful about merging them into the core mechanism.

Why I would hesitate to merge all three ideas into one CIP

Right now, your proposal appears to have a relatively clear thesis:

Utilization-scaled pledge bonus
    ↓
Rewards SPOs for successfully attracting delegation

That is a distinct idea.

If you add:

fee reduction,
CIP-50 leverage limits,

then reviewers may struggle to determine:

Which mechanism is causing which effect?

One common criticism of protocol proposals is:

"Too many variables changed simultaneously."

That makes simulation results harder to interpret.

What I would strongly consider adding

I do think your CIP would benefit from a section like:

Interaction with Other Decentralization Mechanisms

and explicitly discuss:

current fixed fee structure,
CIP-50,
pledge leverage,
delegator passivity.

Something like:

CIP-187 does not directly address low-pledge multipool leverage.

The proposal may be complementary to leverage-based mechanisms such as CIP-50 and to fixed-fee reforms.

That helps reviewers understand:

what problem your proposal solves,
what problems it does not solve.
Why I think your delegator-passivity argument is important

Honestly, after this discussion, I think this may be one of the strongest parts of your overall case.

Most decentralization proposals implicitly assume:

Delegators continuously optimize

But your argument is:

Delegators are often inert

Therefore:

Mechanisms requiring delegator reaction
may have reduced practical impact

That is a testable claim.

And it is different from most pledge discussions.

I would probably make that argument much more explicit in the motivation section.

The most interesting amendment I would consider

Not necessarily changing the mechanism itself.

Instead:

Add simulation sections showing:

Scenario	Result
Current RSS	baseline
CIP-187	result
CIP-187 + 170 fee	result
CIP-50	result
CIP-50 + CIP-187	result

That would be extremely persuasive because it reframes the discussion from:

"Do we like this idea?"

to:

"What actually happens under realistic stake distributions?"

Why I would be cautious about embedding a fee reduction directly into CIP-187

Because fee reduction is a separate governance question.

Someone might agree with:

utilization-scaled pledge bonus

but disagree with:

fee reduction.

Or vice versa.

If they are bundled together, you may lose support from people who like one component but not the other.

Protocol proposals are often easier to evaluate when each mechanism can stand on its own.

One criticism I expect reviewers to raise

After reading your explanation, I suspect some reviewers will ask:

If delegators are truly passive, why would SPOs need to compete harder for delegation under CIP-187?

In other words:

your proposal assumes delegator inertia is a problem,
but it also relies on delegation distribution affecting rewards.

I think your answer would probably be:

The mechanism changes pool rewards automatically based on utilization, so SPOs must seek delegation to maximize rewards even if delegators themselves are relatively passive.

But I would make that distinction extremely explicit.

Because otherwise reviewers may think:

"You're criticizing delegator responsiveness
while still relying on delegation."

Those are actually different claims.

My recommendation

I would not immediately rewrite CIP-187 into:

CIP-187 + CIP-50 + fee reduction

Instead I would:

Keep CIP-187 focused.
Add a section discussing complementarity with CIP-50.
Add a section discussing fixed-fee economics.
Add simulation results for combined scenarios.
Emphasize the delegator-passivity argument much more clearly.

That preserves the identity of the proposal while showing where it fits within the broader decentralization debate.

And yes — from a CIP-process standpoint, amendments and revisions are normal and expected while a proposal is evolving.


One thing I would definitely do

If you amend the CIP, I would add a section that explicitly states something like:

CIP-187 is not intended to solve
low-pledge leverage by itself.

The proposal may be complementary
to leverage-based mechanisms such
as CIP-50 and to fixed-fee reforms.

That does two things:

Shows awareness of a known limitation.
Prevents reviewers from criticizing the CIP for failing to solve a problem it was never designed to solve.

That's often a strong move in protocol design discussions because it clearly defines the proposal's scope.

The CIP process is designed to accommodate exactly this kind of iteration and refinement while a proposal is being developed.




---




Question:  
Can you tell me if there are any active CIPs that call for Fix Fee reduction or elimination?


Answer:  
Yes. There have been several CIPs and community proposals that either reduce, eliminate, or substantially reform the fixed fee (minPoolCost) mechanism.

The two most relevant are:

CIP-74: Set minPoolCost to 0

This is the most direct proposal.

It proposes:

minPoolCost=0

The rationale is very close to the arguments you've been making:

the 340 ADA minimum disproportionately harms smaller pools,
it incentivizes delegation toward larger pools,
it encourages centralization,
most operators simply left fees at 340 regardless of actual operating cost.

The CIP explicitly argues that removing minPoolCost would improve decentralization.

CIP-23: Fair Min Fees

This proposal takes a different approach.

Instead of eliminating operator compensation floors entirely, it proposes:

greatly reducing the fixed fee,
introducing a minimum margin fee (minPoolMargin).

Conceptually:

Less fixed fee
More percentage-based fee

The idea is that margin scales with rewards, while fixed fees disproportionately burden smaller pools.

Interestingly, the examples in the CIP use:

50 ADA fixed fee,
1.5% minimum margin.

So this proposal is philosophically quite close to your thinking that:

lower fixed fees + somewhat higher margins can still support honest SPOs while reducing the advantage of fee farming.

CIP-75: Fair Stake Pool Rewards

This proposal includes a staged plan that eventually removes minPoolCost entirely.

The implementation path proposed:

Reduce minPoolCost from 340 → 100 ADA.
Reduce 100 → 0 ADA.
Remove minPoolCost from the protocol and introduce a revised rewards model.

So CIP-75 is one of the strongest examples of an active CIP that explicitly envisions eventual elimination of the fixed fee floor.

Other proposals

There were also community proposals that never became major active CIPs, including:

Prepaid Fixed Fee

A proposal where the protocol would pay the minimum fixed fee separately before reward distribution, so that small pools would not have the fee consume such a large percentage of rewards.

Variable-fee-centric models

Several discussions proposed:

Lower fixed fee
Higher margin reliance

for exactly the reasons you've been describing.

Something I find interesting relative to your CIP

After reading your arguments, I think your position is actually somewhat different from the classic CIP-23/CIP-74 arguments.

Most fee-reduction proposals argue:

Fixed fees hurt small pools.

Your argument seems more like:

Fixed fees create a scalable revenue stream for multipool replication, and reducing them weakens MPO economics without requiring delegator action.

That is a different framing.

In fact, I don't recall seeing many fee-reduction proposals that focus as heavily on:

delegator inertia

as the core motivation.

Most focus on:

small-pool ROA fairness

instead.

That may actually be a useful distinction to highlight if you decide to amend your CIP discussion sections.

Current status

Of the formal CIPs:

CIP	Approach
CIP-74	Eliminate minimum fixed fee
CIP-23	Reduce fixed fee + minimum margin
CIP-75	Gradual reduction then removal of fixed fee

All three are highly relevant to the fee-reduction ideas you've been exploring.




---






The following are comments from https://github.com/cardano-foundation/CIPs/pull/1193



Summary
This PR proposes a new CIP: Utilization-Scaled Pledge Bonus.

The Cardano reward formula's pledge bonus A = r · a₀ · P / (1 + a₀) depends on operator pledge P but not on pool total stake S. As S grows, the per-delegator share (A − F)/S strictly falls — adding delegation to a high-pledge pool dilutes everyone already there. This punishes the rational-delegator behavior the protocol's Nash equilibrium assumes.

The proposal multiplies the pledge bonus by pool utilization u = min(S, S_sat) / S_sat:

A_new = r · a₀ · P · min(S, S_sat) / (S_sat · (1 + a₀))
A saturated pool earns exactly today's bonus. A half-utilized pool earns half. An empty pledged pool earns nothing until delegators arrive. No new parameter is introduced — a₀ retains its name, governance dial, and Sybil-resistance role. Sybil resistance is in fact strengthened at the formula level: splitting an MPO's pledge across N pools reduces total bonus by roughly 1/N.

CIP folder
Folder in this branch: https://github.com/johnshearing/CIPs/tree/utilization-scaled-pledge-bonus/CIP-0187

Contents:

README.md — the CIP itself.
CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html — an interactive simulator with four guided tutorials (math explainer; stakeholder-by-stakeholder benefits tour; multi-pool operator deterrence tour; free exploration). Also published at https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html and runnable offline from the folder.
utilization_scaled_pledge_bonus.md — full written derivation, numerical anchors, and risk analysis.
Status
Proposed. Category: Ledger (Reward Sharing Scheme, per CIP-0084). Awaiting editor triage and number assignment.

AI disclosure
The CIP was drafted with AI assistance (Claude, Anthropic). The mathematical derivation, the proposed u scaling, and the analysis emerged from extended dialog between the author and the model; all claims have been independently re-derived by the author. A disclosure also appears in the CIP's Acknowledgements section.

@johnshearing
@claude
CIP-XXXX? | Utilization-Scaled Pledge Bonus 
fd832f6
rphair
rphair reviewed 2 weeks ago
Collaborator
rphair
left a comment
• 
Thanks @johnshearing - as you know I'm just one of 3 serving CIP editors but the task of first review about the relevance, structure & detail of a document generally falls to me in the Triage process. These are only my first suggestions in that regard: in the hope of producing a document that both editors & community members can more easily review & more readily produce a mergeable result.

Like other CIPs we will first have to remove some of the supporting content that you have very carefully worked into this submission. TL;DR we can't have HTML here — since it won't work in either the GitHub nor the cips.cardano.org contexts — and in general supporting code has to be linked into a reference implementation maintainer's repository... thankfully your own repo already appears to the primary location of this material as well as its working demo.

Likewise, the "extra text" in a second Markdown file has, I believe, just as much right to be in the CIP as the rest of it. Hopefully in the next week before our next CIP meeting we will have a single Markdown file in this CIP (unless there are illustrations or other assets added later).

CIP-XXXX/README.md
Outdated
CIP-XXXX/README.md
Outdated
CIP-XXXX/README.md
Outdated
CIP-XXXX/README.md
Outdated
CIP-XXXX/README.md
Outdated
CIP-0187/README.md
CIP-0187/README.md
CIP-0187/README.md
CIP-XXXX/utilization_scaled_pledge_bonus.md
Outdated
CIP-XXXX/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html
Outdated
@rphair
Collaborator
rphair
commented
2 weeks ago
p.s. @johnshearing to my #1193 (review): this will be tagged Triage so will be introduced at our next CIP meeting (https://hackmd.io/@cip-editors/135) where you would be welcome to attend & help introduce your proposal.

Also, something I forgot to include in my review above (& will be more efficient to mention here because of the several references): please ensure references to your "Pool Ranger" are appropriately defined & linked... i.e. the first time the term is used, providing a definition & link, so that future references can simply say "Pool Ranger".

@rphair rphair added Category: Ledger State: Triage labels 2 weeks ago
@johnshearing
Author
johnshearing
commented
2 weeks ago
Thank you, @rphair — this is precisely the kind of structural first review I was hoping for, and I'm grateful both for the high-level guidance and for the care you put into the inline comments.

I'll push a revised single-file version shortly, well before the next CIP meeting. At a high level:

Single Markdown file. The content currently in utilization_scaled_pledge_bonus.md will fold into README.md as Appendix A. On review it serves as additional justification and worked examples for points already made in the body of the Rationale — matching the second branch of your suggestion on the line 55 comment.
HTML out of the CIP folder. The interactive simulator will live solely in my own repository, with one or two links from the CIP itself (most likely a brief mention at the end of the Rationale and an entry in References), as you recommended.
Abstract trim. Agreed — the simulator callout currently in the Abstract is too much for that section; it will move to a single sentence further down.
Pool Ranger. I'll define it with a link on first reference and use the bare name thereafter.
Heading grammar, the PR number placeholder, and GitHub hyperlinks for the other CIPs in the Comparison table and References section — all noted.
Glossary. I'd like to handle the math-symbol disambiguation by expanding the existing Notation subsection under Specification, rather than adding a separate Glossary appendix that the editors would need to fact-check from scratch. If a canonical Cardano PoS/RSS glossary already exists somewhere I could link to instead (perhaps @Cerkoryn would know), I'd happily use that — and I'm open to revisiting at the meeting either way.
I'll do my best to attend the next editors' meeting — thank you for the invitation.

@johnshearing
@claude
CIP-XXXX? | Address review: consolidate to single Markdown file 
b7580aa
@johnshearing
Author
johnshearing
commented
2 weeks ago
@rphair I've pushed the revised single-file version (commit b7580aa). Quick summary of what changed, mapped to your review points:

Structural:

utilization_scaled_pledge_bonus.md folded into README.md as Appendix A: Detailed Derivation and Worked Examples, with subsections for the deeper problem statement, the Sybil-resistance math, the worked numerical example (the dilution-becomes-gain anchor), extended per-stakeholder analysis, and the expanded risks table. Sections that directly duplicated the body (the proposal restatement, the comparison table, the closing summary) were dropped.
CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html removed from the CIP folder. The simulator lives at the author's repository and is now linked once at the end of the Rationale and once in References.
Inline suggestions addressed:

Front-matter pull/? → pull/1193.
## Motivation: Why... and ## Rationale: How... capitalized.
Abstract simulator callout removed; the substance now lives in the Rationale and References.
Pool Ranger defined with a link on first reference; subsequent mentions are bare.
GitHub hyperlinks added for CIP-0001, CIP-0050, CIP-0084, and CIP-1694 in both the Comparison table and References. The original Brünjes et al. RSS paper now links to its IACR preprint.
Glossary — flagged in my earlier comment. I expanded the existing Notation subsection under Specification to absorb F, m, p, and A (with current mainnet values), rather than adding a separate Glossary appendix. The math symbols are now disambiguated in the same place the formula is specified. If you or the other editors would prefer a stand-alone Glossary appendix, or a link to a canonical Cardano PoS glossary should @Cerkoryn or others know of one, I'm happy to make that change.

Pool Ranger voice in Appendix A. In the extended stakeholder analysis I generalized the cooperative-bargaining points to "cooperatives" as a class, with Pool Ranger cited as an example only where the abstract claim benefits from a concrete anchor. The intent is to keep the Appendix neutral while preserving the illustrative example.

The CIP-XXXX/ folder now contains only a single README.md. Looking forward to further feedback.

@johnshearing
@claude
CIP-XXXX? | Fix stale references to deleted supporting files 
f5c0aa8
@rphair
Collaborator
rphair
commented
2 weeks ago
@Cerkoryn I suggested tagging you early on & I'd be happy to hear any review, governance, or social suggestions you might have. Here are some points I would suggest at the next CIP meeting, if not already covered here, that you might advise the reviewing community & author about:

Can this proposition be reviewed by the allies of CIP-0050 at the Edinburgh centre? (as per CIP-0050 | Modernization & Additional Research #1042)
If this were to be included with other RSS CIPs for consideration in the next governance vote for hard fork inclusion: what would be the deadline, timeline, and contact point for this?
Ryun1
Ryun1 reviewed 5 days ago
CIP-XXXX/README.md
Outdated
rphair added 2 commits 5 days ago
@rphair
label original PR & add forum link
89f5f9a
@rphair
escaping ? CIP number to avoid YAML error & properly format header
1a5c8a1
@rphair rphair changed the title CIP-???? | Utilization-Scaled Pledge Bonus CIP-0187? | Utilization-Scaled Pledge Bonus 5 days ago
@rphair rphair added State: Confirmed and removed State: Triage labels 5 days ago
rphair
rphair reviewed 5 days ago
Collaborator
rphair
left a comment
• 
@johnshearing thanks for standardising your prior work & writing into a form that has made a strong connection with prior CIPs of similar objectives: helping to confirm this as a candidate at the CIP meeting today. Please update the containing directory to CIP-0187 and update the corresponding links in your OP. 🎉

When the current community-wide work on budgets & related advocacy settles down — maybe in a couple weeks — we remain hopeful that @Cerkoryn can

provide a comparative review (based on long advocacy of other RSS proposals)
possibly get some analytical / mathematical attention, similar to what CIP-0050 has received, from interested parts of the academic community.
We've also noted the novel feature of this proposal that appears to provide "something like pledge leverage (L)" (my wording) as CIP-0050 does without establishing any new protocol parameters: only using a modification to the reward equation itself.

CIP-XXXX/README.md
Outdated
@rphair
assign CIP number 187
24092af
@Cerkoryn
Contributor
Cerkoryn
commented
5 days ago
• 
@johnshearing I read through the CIP and in trying to understand it created the following chart. Please let me know if my understanding is wrong:

Pool	Scenario	Current RSS pledge bonus	Utilization-scaled pledge bonus
Pool 1	P = 100%, S = 100%	100%	100%
Pool 2	P = 50%, S = 100%	50%	50%
Pool 3	P = 50%, S = 50%	50%	25%
Pool 4	P = 0%, S = 100%	0%	0%
Pool 5	P = 0%, S = 50%	0%	0%
On Cardano ADA that is pledged is also counted as stake. Therefore there cannot be any instances where stake < pledge, which leaves out a couple of permutations here.

Pools 2 and 3 I believe are the most interesting to compare. Pool 2 will be producing more total blocks and earning more total rewards due to having twice the stake. However, in both pools 2 and 3 the operator has pledged the same amount of ADA. Under the current RSS, the operator (and any delegators) would be getting the same bonus from pledge in both pools 2 and 3. However, under the proposed utilization-scaled pledge bonus my understanding is that pool 3 would get its pledge bonus cut in half (not the staking rewards, but strictly the bonus from any pledge which is a much smaller amount).

I'm not sure if this is having the effect you intended, as it appears to make pledge less important and simply having enough delegation to saturate your pool the dominating factor. Or am I misunderstanding?

I think an important way to look at it is to look at the per-ADA ROI for the operator that is providing pledge, rather than the percent of pool rewards. If the operator has 1M ADA pledged and there is no other stake in the pool, then the operator earns 100% of rewards. But if he had 1M ADA pledged and the pool had an additional 9M in delegation (10M total stake) then he is only making 10% of the pool's rewards (not including fees). But he's still getting the same return on his 1M ADA pledge in either case, so his rewards didn't go down.

Pledge is by default better than normal stake because it is effectively "free" of all fixed and variable fees (including minPoolCost) because ultimately it's paid back to the same operator anyways. A major benefit of having additional delegation on top of that is that the pool will produce more blocks and the operator will get a small slice of those additional block rewards from pool fees.

@johnshearing
rename folder CIP-XXXX → CIP-0187
11b00e9
@johnshearing johnshearing changed the title CIP-0187? | Utilization-Scaled Pledge Bonus CIP-0187 | Utilization-Scaled Pledge Bonus 5 days ago
@johnshearing
Author
johnshearing
commented
5 days ago
Thank you, @rphair — this is wonderful news.
I'm grateful for all your guidance.
The directory has been renamed to CIP-0187, the frontmatter and links in the OP are updated, and the PR title is corrected.
I'd very much welcome @Cerkoryn's comparative review whenever the budget and advocacy work allows.
The same goes for any analytical / mathematical attention from interested parts of the academic community.

@johnshearing
Author
johnshearing
commented
4 days ago
@Cerkoryn — thank you for taking the time to read the CIP carefully and to lay out the comparison in chart form.
The five-pool table is a good frame for the discussion and makes it easier to answer you precisely.
Let me take your two questions in order.

On your chart
Your math is correct. Under the proposal A_new = A_current · u with u = S / S_sat, so Pool 3 (u = 0.5) earns half of today's pledge bonus. Pool 3 is the right pool to focus on — same pledge as Pool 2, half the delegation, half the proposed bonus.

Pool	Scenario	Current bonus	Proposed bonus
Pool 1	P = 100%, S = 100%	100%	100%
Pool 2	P = 50%, S = 100%	50%	50%
Pool 3	P = 50%, S = 50%	50%	25%  ← halved
Pool 4	P = 0%, S = 100%	0%	0%
Pool 5	P = 0%, S = 50%	0%	0%
Your first question — "it appears to make pledge less important and saturation the dominating factor. Or am I misunderstanding?"
You understand correctly, and that effect is intentional. The CIP states it directly:

Pledge becomes a partnership claim, redeemed by attracting delegation rather than declared in isolation.

An empty pledged pool earns nothing from pledge. A half-utilized one earns half. The whole point is to make pledge contingent on demonstrated demand. The saturation case is preserved exactly — a saturated pool earns today's bonus — so no SPO already running a popular pool loses anything.

Your second question — about the operator
Your operator-side analysis lands. Per-ADA-pledge return is roughly preserved across pool sizes today, because pledge rewards flow back to the same operator (effectively fee-free), and margin plus fixed fee on additional delegators give the operator a slice of every new ADA arriving. I won't dispute that framing — it's a fair operator observation, and the CIP doesn't actually claim that operator dilution is the problem it solves.

But the dilution the CIP names lives on the delegator side, not the operator side. Appendix A.3's worked example uses a 50 M-pledge pool with F = 340, r = 0.000400:

S = 50 M (pledge only): (A − F)/S ≈ 8.55 × 10⁻⁵
S = 75 M (saturated): (A − F)/S ≈ 5.70 × 10⁻⁵
That's a ≈ 0.21% absolute ROA loss absorbed by delegators for the act of arriving at the pool. Per-delegator ROA falls as delegation arrives at a high-pledge pool — the protocol's stated Nash equilibrium (CIP-0084) assumes delegators rotate toward high-pledge, well-operated pools, and today's formula penalizes them in exactly the regime they're supposed to prefer. Under the proposal A/S becomes independent of S and the slope flips positive everywhere.

To be fully candid: there are parameter regimes (low margin, low fee, high pledge) where the operator's income curve also dips when delegators arrive — the "red zone" in the simulator — but those aren't typical pool parameters, so the delegator dilution above is the load-bearing argument, not the operator one.

Structural wins beyond dilution
Even granting your operator point in full, two structural wins remain that don't depend on operator dilution at all:

1. Cooperative bargaining surface. A coordinator (Pool Ranger, or any large delegator) lifts A_new / S for every existing delegator by arriving, and drops it visibly by leaving. The threat of withdrawal becomes a publicly computable mathematical event, giving SPOs a continuous incentive to retain large delegators, not just attract them.

2. MPO deterrence at the formula level. a₀ is untouched, so Sybil resistance via delegator preference is preserved exactly as it stands. On top of that, the proposal adds a formula-level cost for splitting. For a 50 M ADA holder (r = 0.000548, a₀ = 0.3, S_sat = 75 M, self-funded splits):


A 10-way self-funded split costs roughly 277 K ADA/year in forgone bonus versus staying in one pool; today it costs zero. The cost grows linearly with N, and the formula-level deterrent compounds with the existing delegator-preference channel.

These two wins hold whether or not operators are diluted today.

A visual walkthrough, if you'd like to step through it
I've added a guided presentation to the interactive simulator that walks through your two questions card-by-card, loads Pool 3 into the chart so the halved bonus is visible on the metric cards, and steps through the responses above:

https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html

Click the button "▶ A reviewer's questions about Pool 3 — answered card by card" at the top, or press ▶ Play inside the card to let it run on its own. Eleven steps, ~2 minutes if autoplayed.

Thank you again for the careful read — your framing of Pool 3 sharpened the response, and I'd welcome any pushback on the delegator-side numbers or the MPO table, which are where the case actually lives.

@johnshearing
Author
johnshearing
commented
4 days ago
• 
@Cerkoryn

My reporting software shows 19 private whale pools with 70M ADA or more pledged that take 100% margin.
Many of these are multipools.
The proposed changes in the CIP do not affect these pools because they are at saturation.
These pools are ignored in the following narative.

One of things I am realizing is that the CIP only affects pools that have a pledge of 3M ADA or more.
And there are only 9 or so pools that have that much pledge and are open to the public for delegation.
2 pools have 50M ADA pledged,
1 pool has 35M ADA pledged.
2 pools have 30M ADA pledged.
2 pools have 8M ADA pledged.
2 pools have 3M ADA pledged.
And the CIP doesn't affect pools with a lower pledge than that.
https://johnshearing.github.io/pool_ranger/epoch_agent/epoch_report_viewer.html
https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html

6 of the above 9 pools are multipools. More on that at the end of this post.

It looks like the majority of multipools have little or no pledge at all.
So what problem are we solving with only 9 pools affected by the CIP?
Well every benefit the CIP claims seems to hold true for those 9 pools.
And the intent of the protocol is 500 or so high pledge nearly saturated pools.
If Cardano converges toward this intended equilibrium then the CIP helps.
So the CIP might provide meaningful and positive incentives in the future.
But for now, any benefit will be small.

There is a text input control in the simulator that accepts a pool ticker or a pool ID.
I used this to check all 9 pools with high stake.
The delegation on those pools is so high already that these pools are completely unaffected by the proposed changes.
So literally no pools are currently affected by this CIP.
The low pledge pools are not affected by the CIP and the high pledge pools already have the delegation they need to avoid any penalty - except for one - more on that at the bottom of this post.

My reading on all of this is as follows:
The proposed changes have all the benefits claimed for high pledge pools.
500 high pledge nearly saturated pools are the intended target state for the protocol.
This is what the CIP incentivizes.
If the CIP is implemented now, nobody will care because hardly anyone is affected.
If there was ever a time to do this it would be now while no one is affected.

Regarding the few high pledge multipools that are actually open for business:
I looked at the two 50M and a 30M ADA pledged pool.
pool155p7g23vdme50kp5lfqylfx5h7ndldyz2mletvr8fqucqzyrk44
pool1l0m820vyqh5pp2yzpw973qzz23neqqd977u0uczh9fs9zqvg0je
pool1ljqjqskd4f4zekzddw204u5xtzhyz2cllq5v5dmn27zdwf9c70f
These have no ticker but they self identify as Pool WPBJ1, WPBJ2, WPBJ3
These are operated by operated by WavePool for BitPoint.
https://adastat.net/pools/a503e42a2c6ef347d834fa404fa4d4bfa6dfb48256ff95b067483980
https://adastat.net/pools/fbf6753d8405e810a8820b8be8804254679001a5f7b8fe60572a6051
https://adastat.net/pools/fc812042cdaa6a2cd84d6b94faf28658ae412b1ff828ca37735784d7
These big pledge pools are multipools but they need to be because they would over saturate if they pledged to 1 pool.

The 35M ADA pledges pool is also operated by Wave Pool but for GMO1 Coin Staking Pool
pool1457cnl7qu568h98xrw8krfnjkhf05mfhaq2l50epwy36yuln20q
https://adastat.net/pools/fbf6753d8405e810a8820b8be8804254679001a5f7b8fe60572a6051

The two 8M ADA pledged pools are HODLA
It's a multipool.
They have split their pledge between two pools because currently there is no reduction in pledge bonus for doing so.
Under the proposed changes, the simulator says they would suffer a combined loss of 150 ADA per epoch (compared to one single pool operation) if delegation for each pool is not doubled.
This is the type of pool the CIP incentivizes to revert back to single pool operation.
pool1a4qtpgce7cu6wzc79fx7qrc3938hkl2gf8c2h5jugvm2gnu86l7
pool19asxjgd6ah9ddzauwede4wpt9vsp6s4ax5nz297wt47evc9sn7z
https://adastat.net/pools/ed40b0a319f639a70b1e2a4de00f112c4f7b7d4849f0abd25c4336a4
https://adastat.net/pools/2f606921baedcad68bbc765b9ab82b2b201d42bd35262517ce5d7d96

This has been great fun!
I have learned much about stake pools, about simulations, (and about the CIP process thanks to @rphair).
I would be delighted to continue this work further if there is need.

Thanks so much for looking over the CIP

@johnshearing
Author
johnshearing
commented
yesterday
• 
Hi @Cerkoryn,

After having had more time to think about your questions I realized the following may also deserve a response:

You wrote:

But if he had 1M ADA pledged and the pool had an additional 9M in delegation (10M total stake) then he is only making 10% of the pool's rewards (not including fees). But he's still getting the same return on his 1M ADA pledge in either case, so his rewards didn't go down.

You are correct that under the current system, the operator would receive the same absolute pledge bonus whether the pool has 1M ADA pledge with no delegation or 1M ADA pledge + 9M ADA delegation. The current pledge bonus depends only on the declared pledge and is unaffected by utilization.

However, under the proposed CIP, this changes.
I fed your values (1M ADA pledge, 9M ADA delegation) into the simulator.
Since you didn’t specify fee and margin in your example, I selected 170 ADA fixed fee and 1% margin as they produce a competitive ROA for a pool of this size.

Under the current system, the SPO earns 497 ADA per epoch.
Under the proposed CIP, the SPO earns 488 ADA per epoch.
This is a difference of 9 ADA per epoch, or approximately 657 ADA per year.

This reduction occurs because the pledge bonus is scaled by the pool’s utilization (u = 10M / 75M ≈ 13.3%). The design intentionally makes the pledge bonus something the operator earns through actual delegation and utilization, rather than simply by declaring and locking pledge. Low-utilization pools (even with meaningful pledge) receive a proportionally reduced bonus.
This directly addresses one of the main issues in the problem statement — the current rules incentivize creating low-utilization, high-pledge pools because operators still collect nearly the full pledge bonus with minimal real delegation.

One thing really surprises me about this result: Above in the previous post I said the following:

One of things I am realizing is that the CIP only affects pools that have a pledge of 3M ADA or more.
And there are only 9 or so pools that have that much pledge and are open to the public for delegation.

By simulating your question about a 1M ADA pledged pool, I now see that this CIP has a significant effect on pools with pledges as small as 1M ADA.

Thank you again for taking the time to review the CIP