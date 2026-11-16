const compareOrder = (left, right) => (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER)

export const orderedHabits = (habits) => [...habits].sort(compareOrder)

export const orderedFoundationHabits = (habits) => [...habits].sort((left, right) =>
  (left.foundation_order ?? left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.foundation_order ?? right.sort_order ?? Number.MAX_SAFE_INTEGER),
)

const reindex = (habits, field) => habits.map((habit, index) => ({ ...habit, [field]: index }))

export function reorderHabitsInCategory(categories, categoryId, sourceId, targetId) {
  return categories.map(category => {
    if (category.id !== categoryId) return category
    const habits = orderedHabits(category.habits || [])
    const sourceIndex = habits.findIndex(habit => habit.id === sourceId)
    const targetIndex = habits.findIndex(habit => habit.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return category
    const next = [...habits]
    next.splice(targetIndex, 0, next.splice(sourceIndex, 1)[0])
    return { ...category, habits: reindex(next, 'sort_order') }
  })
}

export function moveHabitToCategory(categories, habitId, targetCategoryId) {
  let moved = null
  const without = categories.map(category => {
    const habits = (category.habits || []).filter(habit => {
      if (habit.id !== habitId) return true
      moved = habit
      return false
    })
    return { ...category, habits: reindex(orderedHabits(habits), 'sort_order') }
  })
  if (!moved) return categories
  return without.map(category => category.id === targetCategoryId
    ? { ...category, habits: [...orderedHabits(category.habits || []), { ...moved, sort_order: (category.habits || []).length }] }
    : category,
  )
}

export function reorderFoundationHabits(categories, sourceId, targetId) {
  const foundation = orderedFoundationHabits(categories.flatMap(category => category.habits || []).filter(habit => habit.foundation))
  const sourceIndex = foundation.findIndex(habit => habit.id === sourceId)
  const targetIndex = foundation.findIndex(habit => habit.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return categories
  const next = [...foundation]
  next.splice(targetIndex, 0, next.splice(sourceIndex, 1)[0])
  const orderById = new Map(reindex(next, 'foundation_order').map(habit => [habit.id, habit.foundation_order]))
  return categories.map(category => ({ ...category, habits: (category.habits || []).map(habit => orderById.has(habit.id) ? { ...habit, foundation_order: orderById.get(habit.id) } : habit) }))
}
