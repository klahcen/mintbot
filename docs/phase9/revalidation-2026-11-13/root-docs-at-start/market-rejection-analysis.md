# Phase 9 diagnosis of the eight Phase 8 market failures

Every original decision is reproduced from retained account bytes and original launch identity, not inferred from an error label. The new structured `marketFailure` evidence preserves exact unsupported layout/variant and identity/supply fields without changing admission rules or error strings. [The fixture regression](../tests/phase9-market-diagnostics.test.ts) asserts all eight classifications.

| Original stable identity | First failure and additional verified observations |
|---|---|
| pump:5gMLuFCwMLyWCSAm9RaMntqcaTaLA8ofytkriqZS8qbvgMWUtpu469bbxJcjzcqM3EsATp2L1CiFhV6MVRjYiCkh:0 | Mayhem flag; mint supply 2,000,000,000,000,000 > curve total 1,000,000,000,000,000; decimals 6 and creator match |
| pump:41yFQeGjq4LfnxxD2Ye5srgYh4N2QNBwiMADWaAqLNCvw33bxCG4jNDLWfBaCnah8jkyE6FL39t6UsyncYXdE5Q2:0 | Mayhem flag; mint supply 2,000,000,000,000,000 > curve total 1,000,000,000,000,000; decimals 6 and creator match |
| pump:4px7ePVC9qhyZ6KhrjNp2ZP6KRMoSaKKfyfptKhhvK16W7Fq9JubbHs7A9fDchAfEdVwS57h5V5nmXoSKcAZmAxC:0 | Unsupported non-native quote mint XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX; creator also changed |
| pump:2a8BjZiQTUNjxdwy42FN6yhwnyE48bHs4PVJssrMArjwxGxMwXp5nCbvCb6kdebVEjUNJ2Cuyx828M1rtojD8W4t:0 | Stale/unknown original event time; no market retrieval |
| pump:41pru88jgu253QUH51d1uaB9AFYuDXg6cxydD2BUDYY9nbEnJhxADbT1uF6h7EMMTGWD1GTxUf8Tf392MdLzBoRX:0 | Mayhem flag; mint supply 2,000,000,000,000,000 > curve total 1,000,000,000,000,000; decimals 6 and creator match |
| pump:xqP22RsYz4SEhi1BKad3HchwAAQK5aVwh7Wxczm6xAf5hUXXsz8KDpbtEAwpxxYQFENV9xEMnrGjhLWETeN2NxE:0 | Stale/unknown original event time; no market retrieval |
| pump:5XGMFRBPL9uKdc551yM8nmAkz1P9Cr23ZG8yxCN1YSvmNKEqEJX39c6BbYZs1nCF2X1reQB89r1GrTUuK1YRveam:0 | Unsupported non-native quote mint pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn |
| pump:5rYnxYyPLDSJjPt96yJKDvZRcedsnZ4xtSsDmmJ8dyNACqK5HCvrmPAoXA7wJCv91EoL6PUM5mocoeXuG1CmEnGb:0 | Mayhem flag; mint supply 2,000,000,000,000,000 > curve total 1,000,000,000,000,000; decimals 6 and creator match |

Four are supply-model incompatibilities on observed Mayhem curves; two are unsupported non-native quote variants, one with a changed current curve creator. Those are protocol/identity evidence failures, not demonstrated malicious transfer restrictions or holder concentration failures. Both other decisions failed freshness before account retrieval. The six retained mint decodes have six decimals and verified metadata-only transfer-extension evidence; this does not prove every mandatory token risk signal safe. Completed curves, missing accounts or a program upgrade are not asserted as causes of these eight decisions.

[market-diagnostics.json](phase9/market-diagnostics.json) contains exact original batches, original reasons and current finalized account rereads with provider/context. Current bytes may differ from the historical decision and cannot repair its freshness or authorize a retrospective trade. Current loader deployment headers matched all four retained pins in [protocol-review.json](phase9/protocol-review.json); loader equality is not ELF/semantic equivalence.

The pinned upstream [Pump documentation](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22) and captured IDL describe Mayhem, quote-mint and depth fields. A layout label alone does not validate changed custody, supply, fees, multihop quotes or both unsigned swap sides. These variants remain disabled until the complete proof chain exists. Mandatory authorities, extensions, transfer restrictions, liquidity, concentration, fresh evidence and sell feasibility were not relaxed.
