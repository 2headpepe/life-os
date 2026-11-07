export async function commitDeliveryMutation({
  tree, treeBefore, initiative, operationType, nodeIds,
  createOperationId, now, checksum, appendOperation, writeTree,
  appendInitiative, restoreTree,
}) {
  const operation = {
    id: createOperationId(), schema_version: 1, operation_type: operationType,
    node_ids: nodeIds, initiative_id: initiative.id,
    tree_before_checksum: checksum(treeBefore), initiative_before_checksum: checksum(initiative.before),
    state: 'planned', created_at: now(), updated_at: now(),
  }
  await appendOperation(operation)
  try {
    await writeTree(tree)
    await appendInitiative(initiative.after)
  } catch (error) {
    let recovered = false
    try {
      await restoreTree(treeBefore)
      recovered = true
    } catch { /* the recovery receipt below is the remaining safe trace */ }
    await appendOperation({
      ...operation, state: recovered ? 'recovered' : 'recovery_required',
      error: error.message, updated_at: now(),
    })
    throw error
  }
  await appendOperation({ ...operation, state: 'committed', updated_at: now() })
}
