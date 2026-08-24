# Live provider acceptance

Live provider acceptance is intentionally separate from the read-only
readiness job because it creates billable external requests. Do not run this
matrix against production until the operator has approved the provider test
accounts, models and maximum budget.

For every provider/model contract enabled for priced routing, record:

| Check | Required evidence |
|---|---|
| Quote | User quote and frozen purchase/retail version IDs |
| Route | Ordered candidate channel-model IDs and selected candidate |
| Reserve | Wallet ledger debit and reserved pricing snapshot |
| Success | Provider request ID, normalized actual usage and settled snapshot |
| Failover | First provider failure, next frozen candidate and final settlement |
| Refund | Failed request ledger credit and `refunded` snapshot |
| Reconciliation | No stale `reserved` or unexplained `pending` snapshot |

The minimum bounded matrix is:

1. one successful non-streaming Token request;
2. one successful streaming Token request;
3. one image request with a validated image count;
4. one audio-duration request with known file duration;
5. one asynchronous video request with validated duration and resolution;
6. one controlled 429 response followed by the next frozen candidate;
7. three controlled 5xx/timeout responses to open the circuit, followed by a
   half-open recovery;
8. one provider failure after reservation to prove an exact refund;
9. one actual-usage result below reservation and one above reservation to prove
   refund and bounded supplemental charge;
10. a final reconciliation export for the test request-ID prefix.

Use dedicated low-quota users and provider test credentials. Prefix every
request ID with a unique acceptance run ID. Stop immediately if a request
selects a candidate outside its frozen route, produces a negative amount,
leaves a stale reservation, exceeds the approved budget or writes a snapshot
without frozen version IDs.

The repository's automated tests cover these contracts with local databases
and controlled failures. This checklist is the final external-provider
confirmation and necessarily contacts provider systems.
