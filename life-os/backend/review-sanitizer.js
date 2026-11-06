const STATES = new Set(['draft', 'reviewed', 'no_follow_up', 'needs_verification', 'not_verifiable', 'rejected'])
const CLASSIFICATIONS = new Set(['question', 'research', 'plan', 'implementation', 'diagnosis', 'other'])
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const SAFE_ID = /^[a-z0-9:_-]{1,160}$/i

const timestamp = value => typeof value === 'string' && ISO_TIMESTAMP.test(value) ? value : null

// The public read model is deliberately smaller than a stored review. It never
// forwards arbitrary strings, prose or paths from an operational record.
export function publicReview(record = {}) {
  return {
    id: SAFE_ID.test(String(record.id || '')) ? String(record.id) : null,
    schema_version: Number.isInteger(record.schema_version) ? record.schema_version : 1,
    state: STATES.has(record.state) ? record.state : 'draft',
    classification: CLASSIFICATIONS.has(record.classification) ? record.classification : null,
    created_at: timestamp(record.created_at),
    updated_at: timestamp(record.updated_at),
    reviewed_at: timestamp(record.reviewed_at),
    evidence_refs: Array.isArray(record.evidence_refs) ? record.evidence_refs.filter(ref => SAFE_ID.test(String(ref))).map(String) : [],
    source_hashes: Array.isArray(record.source_hashes) ? record.source_hashes.filter(hash => /^[a-f0-9]{16,128}$/i.test(String(hash))).map(String) : [],
  }
}
