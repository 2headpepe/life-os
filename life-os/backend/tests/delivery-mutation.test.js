import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitDeliveryMutation } from '../delivery-mutation.js'

test('failed composed mutation restores the tree and leaves a recovery receipt', async () => {
  const receipts = []
  let restored = null
  await assert.rejects(() => commitDeliveryMutation({
    tree: { nodes: ['after'] }, treeBefore: { nodes: ['before'] },
    initiative: { id: 'initiative:test', before: { version: 1 }, after: { version: 2 } },
    operationType: 'delete_delivery_work', nodeIds: ['dependency'],
    createOperationId: () => 'operation:test', now: () => '2026-11-05T00:00:00Z',
    checksum: value => JSON.stringify(value), appendOperation: async value => receipts.push(value),
    writeTree: async () => {},
    appendInitiative: async () => { throw new Error('initiative write failed') },
    restoreTree: async value => { restored = value },
  }), /initiative write failed/)
  assert.deepEqual(restored, { nodes: ['before'] })
  assert.deepEqual(receipts.map(receipt => receipt.state), ['planned', 'recovered'])
  assert.equal(receipts[1].error, 'initiative write failed')
})
