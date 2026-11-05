# Codex SSB connection and invite exchange

Requested by Ev on 2026-11-04 (America/Chicago).
Status: **Awaiting a fresh production-issued invite. No invitation redeemed and no production replication verified.**

## Identity and destination

Codex's dedicated SSB feed ID:

```text
@MUC+XjmuwOetmE0B9kKPk4eYfjnoz5N/LW0nVFy2sTk=.ed25519
```

This identity is separate from the Codex and Muse Wiredove/ANProto identities.
Its private key is backed up privately; no private feed key belongs in this repository.
Reuse this identity rather than generating another key for each session.

Production node: `ssb.evbogue.com:8008`.
Previously documented production node ID:

```text
@W/3xc8yNihcdPUBGQY2D6Eg+2CgrctZ2wHGqgyBNnxs=.ed25519
```

Confirm that node ID with the live server before using a returned invite.

## Authorized scope

Ev requested connecting the dedicated Codex identity to the existing production
SSB node, obtaining an invite and synchronizing data, and explicitly allowed
using this SSBC repository to exchange invites.

Do not redeem the invite in muse-invite.md for Codex; it was issued for Muse.
This request does not require an application deployment, production restart,
key rotation or proxy/TLS changes.

## Production operator / agent action

From the existing production SSBC checkout, read the host operations instructions
and identify the running node's configuration before executing commands. The
README currently identifies `/root/ssbc`; do not start a second production node.
Use the same configuration/environment as the active node:

```sh
node bin.js whoami
node bin.js invite.create 1
```

Issue a fresh single-use invite for the Codex feed above. Return it in this
document (or a linked repository response), with the issuing node ID, transport,
endpoint and issue time. An invite contains a redeemable capability: exchange
privately when available; if deliberately posted publicly under Ev's repository
exchange authorization, anyone finding it can redeem its one use. Never include
the production or Codex private feed keys.

The client environment reaches HTTPS through a proxy but has not established
raw TCP connectivity to port 8008. If the existing production configuration
advertises a working secure WebSocket SHS endpoint, provide a supported
WebSocket invite/address as well. Confirm it is the authenticated SSB transport,
not an unauthenticated web UI session. Do not invent an address, change production
configuration, or assume that an HTTP 200 proves a protocol connection.

## Codex acceptance and replication verification

1. Recover the existing private SSB identity and its current local feed/database.
   Check `whoami` against the exact Codex ID above. Use one writer for the feed.
2. Verify the invite's server ID and endpoint before redeeming it.
3. With that local node running, use its actual config:
   `node bin.js invite.accept '<fresh invite>'`.
   Do not log the unused token or accept a different recipient's invite.
4. Verify successful redemption and the signed reciprocal contact/follow records.
   A local follow alone is not evidence that production followed Codex.
5. Enable the intended peer connection and check active authenticated gossip/EBT
   replication. Request the production author's feed and observe local sequence
   advancement, then retrieve at least one replicated signed message locally.
6. Record the peer ID, observed sequences/message IDs, time and any missing feeds.
   Follow scope determines replication; do not promise the entire network database.
7. Preserve the complete local feed/database after any signed writes, in addition
   to the private identity backup. Restore/reconcile feed history before later
   publication to avoid sequence forks.
8. Update this document with observed acceptance/replication results. Remove any
   live unused capability from the current document when practical after handling;
   Git history is permanent, so use single-use invites.

## Observed client status

- SSBC source baseline: `05bf56d593ecd76723b9abdb1bc86063559b90b7`.
- Local server startup and RPC `whoami` succeeded with the Codex identity.
- A local restart retained the same feed ID.
- A separately restored private backup passed a signing/verification check.
- Local runtime currently uses explicit loopback configuration and a runtime-only
  network-interface fallback because interface enumeration is restricted.
- Separate tool executions can have isolated network/PID namespaces; server and
  RPC verification must run in the same execution context.
- HTTPS to the production site returned 200. This is web reachability only.
- SSH attempt failed at hostname resolution; no SSH agent/credentials are available.
- No production invite has been issued or redeemed in this session.
- No production SSB connection, reciprocal follow or data sync has been claimed.

## Related work

Once the connection and Muse's SSB recipient ID are verified, the pending handoff
is Wiredove's [consolidation work order](https://github.com/evbogue/wiredove/blob/master/CONSOLIDATION_WORK_ORDER.md)
(source commit `c1832c3670b8b744d253ef1bdf5e7e5c40f448f8`).
Do not guess Muse's SSB ID from its Wiredove key or from the production pub key.
