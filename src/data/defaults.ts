import type { AppState, Connector } from '@/types/domain'
import { defaultPathVariables } from '@/lib/pathVariables'
import { createDefaultSystemKeybinds } from '@/lib/systemKeybinds'

/** Map daemon connector payloads into UI connectors. Manifest fields win. */
export function mapDaemonConnectors(
  raw: {
    id: string
    name: string
    description?: string
    kind?: 'Local' | 'Web'
    scope?: string
    popular?: boolean
    logo?: string
    permission?: Connector['permission']
    auth?: Connector['auth']
    setup?: { kind: string }
  }[],
  previous: Connector[] = [],
): Connector[] {
  return raw.map((item) => {
    const prev = previous.find((c) => c.id === item.id)
    return {
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      scope: item.scope ?? '',
      kind: item.kind ?? 'Local',
      popular: item.popular ?? false,
      logo: item.logo,
      permission: item.permission,
      auth: item.auth,
      setup: item.setup,
      accountLabel: prev?.accountLabel,
      authStatus: prev?.authStatus ?? (item.id === 'fs' ? 'connected' : 'available'),
    }
  })
}

/** Empty in-memory state — automations, logs, and rules load from the daemon. */
export function createEmptyState(): AppState {
  return {
    route: 'overview',
    daemonStatus: 'idle',
    lastError: null,
    llm: {
      mode: 'cloud',
      provider: 'openai',
      apiKey: '',
      localModelPath: '',
    },
    general: {
      launchAtLogin: true,
      hideInFullscreen: true,
      openDashboardOnLaunch: false,
      keepRunningInBackground: true,
      confirmBeforeQuit: true,
      showMenuBarTitle: true,
      showInDock: true,
    },
    appearance: {
      accentHue: 210,
      accentIntensity: 0,
      reduceTransparency: false,
      uiFontSize: 13,
      uiFontFamily: 'sf-pro',
      fontSmoothing: true,
      reduceMotion: false,
    },
    account: {
      firstName: '',
      lastName: '',
      email: 'emmi.dev',
      handle: '',
      avatarDataUrl: null,
      license: 'personal',
      licenseLabel: 'Personal',
      memberSince: new Date().toISOString().slice(0, 10),
    },
    notifications: {
      menuBarBadge: true,
      systemNotifications: false,
      soundEnabled: true,
      notifyOnFailure: true,
      notifyOnReview: true,
      notifyOnSuccess: false,
      quietHoursEnabled: false,
    },
    automationsPrefs: {
      confirmDestructiveActions: true,
      requireReviewForDeletes: true,
      pauseWhenAsleep: true,
      pauseOnBattery: false,
      autoPromoteAfter: 5,
      maxConcurrentRuns: 3,
    },
    other: {
      checkForUpdates: true,
      shareUsageData: false,
      keepDetailedLogs: true,
      verboseDaemonLogs: false,
      showExperimentalConnectors: false,
      clearLogsAfterDays: 30,
      allowCloudConnectors: true,
    },
    keybinds: {
      enabled: true,
      appFocusedOnly: false,
    },
    systemKeybinds: createDefaultSystemKeybinds(),
    pathVariables: defaultPathVariables(),
    pending: [],
    ruleLibrary: [],
    automations: [],
    connectors: [],
    logs: [],
    dismissedNotificationIds: [],
    blocking: null,
    firstRunDismissed: true,
    memoryMb: null,
    ruleCodeEpoch: 0,
    editingAutomationId: null,
    viewingDetailedLogId: null,
  }
}
