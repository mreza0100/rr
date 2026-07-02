// CLAIM AUDITOR prompts — the batched mechanical quote-audit template + its assembly function. Template
// strings are module-level consts; buildClaimAuditor only assembles/substitutes the items list.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { ClaimAuditArgs } from '../../types/index.js';

const CLAIM_AUDIT_TPL = `{{! claimAuditor — batched mechanical quote audit: does each claim's quote exist verbatim in its cache file, and does it carry the claim on its own? }}
You are the CLAIM AUDITOR. For each item below, mechanically verify its quote against the cache file on disk — you are grepping for a pin, not judging truth.
Items (\`#id claim | quote | cachePath\`):
{{items}}
For EACH item, use python3 for a robust substring search: read the file at cachePath with errors='replace'; collapse runs of whitespace to a single space in BOTH the file text and the quote; then test whether the normalized quote is a substring of the normalized file text. If the file cannot be read for any reason (missing, permission error, anything) NEVER fabricate a verdict — that item's verdict is 'fail' with note "file unreadable".
When the quote IS found verbatim, also judge whether the quoted text, on its own, actually carries the claim (not merely nearby context) — verdict 'pass' only when both hold; otherwise 'fail' with a one-line note.
Return checks: one {id, verdict, note?} per item — verdict is 'pass' or 'fail'.{{FINISH}}
`;

export const buildClaimAuditor = ({ items }: ClaimAuditArgs) =>
  render(CLAIM_AUDIT_TPL, { items: plain(items), FINISH });
