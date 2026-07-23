const cache = new Map<string, string>()

export function ruleCodeKey(connectorId: string, ruleId: string) {
  return `${connectorId}/${ruleId}`
}

export function getCachedRuleCode(connectorId: string, ruleId: string) {
  return cache.get(ruleCodeKey(connectorId, ruleId))
}

export function setCachedRuleCode(connectorId: string, ruleId: string, code: string) {
  cache.set(ruleCodeKey(connectorId, ruleId), code)
}

export function deleteCachedRuleCode(connectorId: string, ruleId: string) {
  cache.delete(ruleCodeKey(connectorId, ruleId))
}

export function clearRuleCodeCache() {
  cache.clear()
}
