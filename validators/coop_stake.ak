use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Credential, VerificationKey}
use cardano/assets
use cardano/certificate.{
  Certificate, Delegate, DelegateBlockProduction, DelegateCredential,
  RegisterAndDelegateCredential, RegisterCredential, UnregisterCredential,
}
use cardano/transaction.{Output, Transaction}

validator coop_stake(
  admin_pkh: VerificationKeyHash,
  member_pkh: VerificationKeyHash,
) {
  // Controls stake certificate operations for this member's coop credential.
  publish(_redeemer: Data, certificate: Certificate, tx: Transaction) {
    let signed_by_admin = list.has(tx.extra_signatories, admin_pkh)
    let signed_by_member = list.has(tx.extra_signatories, member_pkh)
    when certificate is {
      // Either party may register the stake credential.
      RegisterCredential { .. } -> signed_by_admin || signed_by_member
      // Delegation to a pool: only admin (the cooperative's core control).
      DelegateCredential { delegate, .. } ->
        when delegate is {
          DelegateBlockProduction { .. } -> signed_by_admin
          _ -> False
        }
      // Either party may deregister (member can always exit the cooperative).
      UnregisterCredential { .. } -> signed_by_admin || signed_by_member
      // Combined register+delegate in one tx: only admin.
      RegisterAndDelegateCredential { .. } -> signed_by_admin
      _ -> False
    }
  }

  // Controls reward withdrawal from this member's coop stake account.
  //
  // Phase 1 rule (1-epoch window enforced socially off-chain):
  //   admin signs  → admin keeps 1%, member must receive ≥ 99%
  //   only member  → member receives 100%
  //
  // Phase 2 will add a validity_range check against the epoch boundary
  // to enforce the window on-chain.
  withdraw(_redeemer: Data, account: Credential, tx: Transaction) {
    let signed_by_admin = list.has(tx.extra_signatories, admin_pkh)
    let signed_by_member = list.has(tx.extra_signatories, member_pkh)

    // Find how much is being withdrawn for this credential.
    expect Some(withdrawal_amount) =
      list.find_map(
        tx.withdrawals,
        fn(Pair(cred, amount)) {
          if cred == account {
            Some(amount)
          } else {
            None
          }
        },
      )

    let member_received = member_lovelace_received(tx.outputs, member_pkh)

    if signed_by_admin {
      // Admin window: admin keeps 1%, member must receive at least 99%.
      member_received >= withdrawal_amount * 99 / 100
    } else {
      // Member self-withdrawal: 100% must reach the member.
      signed_by_member && member_received >= withdrawal_amount
    }
  }

  // Reject all other script purposes (spend, mint, vote, propose).
  else(_) {
    False
  }
}

// Sum all lovelace in outputs whose payment credential matches the member's key.
fn member_lovelace_received(
  outputs: List<Output>,
  pkh: VerificationKeyHash,
) -> Int {
  list.foldl(
    outputs,
    0,
    fn(output, acc) {
      when output.address.payment_credential is {
        VerificationKey(h) ->
          if h == pkh {
            acc + assets.lovelace_of(output.value)
          } else {
            acc
          }
        _ -> acc
      }
    },
  )
}
