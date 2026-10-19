import {Box, Button, Card, Flex, Select, Stack, Text} from '@sanity/ui'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useDataset, useProjectId} from 'sanity'

import {fetchSanitySession, resourceAuthFromSettings} from './hyperlocalise-client'
import type {HyperlocalisePluginOptions} from './plugin-options'
import {fetchSanityIntegrationHealth, runSanityOAuthHandoff} from './sanity-oauth'
import {loadSettings, saveSettings, type PluginSettings} from './settings'

type Screen = 'connect' | 'project' | 'workflow'

export function HyperlocaliseTool({pluginOptions}: {pluginOptions: HyperlocalisePluginOptions}) {
  const sanityProjectId = useProjectId() ?? ''
  const dataset = useDataset() ?? 'production'
  const settingsScope = `${sanityProjectId}:${dataset}`
  const [screen, setScreen] = useState<Screen>('connect')
  const [loadedScope, setLoadedScope] = useState(settingsScope)
  const [settings, setSettings] = useState<PluginSettings>(() =>
    loadSettings(sanityProjectId, dataset),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionProjects, setSessionProjects] = useState<
    Array<{id: string; name: string; sourceLocale: string; targetLocales: string[]}>
  >([])

  const appUrl = settings.appUrl
  const auth = useMemo(() => resourceAuthFromSettings(settings), [settings])

  if (loadedScope !== settingsScope) {
    setLoadedScope(settingsScope)
    setSettings(loadSettings(sanityProjectId, dataset))
  }
  if (!auth && screen !== 'connect') {
    setScreen('connect')
  }

  useEffect(() => {
    if (!auth) {
      return
    }
    void (async () => {
      try {
        const session = await fetchSanitySession({appUrl, auth})
        setSessionProjects(session.projects)
        setScreen(settings.projectId ? 'workflow' : 'project')
      } catch {
        setScreen('connect')
      }
    })()
  }, [auth, appUrl, settings.projectId])

  const connect = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const health = await fetchSanityIntegrationHealth(appUrl)
      if (!health.sanityOauthConfigured || !health.sanityOauthClientId) {
        throw new Error('Hyperlocalise OAuth is not configured for this app URL.')
      }
      const tokens = await runSanityOAuthHandoff({
        appUrl,
        clientId: health.sanityOauthClientId,
      })
      const next = saveSettings(sanityProjectId, dataset, {
        ...settings,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
      setSettings(next)
      setScreen('project')
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Connect failed.')
    } finally {
      setBusy(false)
    }
  }, [appUrl, dataset, sanityProjectId, settings])

  if (screen === 'connect') {
    return (
      <Box padding={4}>
        <Stack gap={4}>
          <Text size={2} weight="semibold">
            Connect Hyperlocalise
          </Text>
          <Text muted size={1}>
            Sign in with OAuth to link this Studio to your workspace. Local development uses the
            same PKCE handoff flow as production.
          </Text>
          {error ? (
            <Card padding={3} tone="critical">
              <Text size={1}>{error}</Text>
            </Card>
          ) : null}
          <Button
            text="Connect Hyperlocalise"
            tone="primary"
            disabled={busy}
            onClick={() => void connect()}
          />
        </Stack>
      </Box>
    )
  }

  if (screen === 'project') {
    return (
      <Box padding={4}>
        <Stack gap={4}>
          <Text size={2} weight="semibold">
            Choose project
          </Text>
          <Select
            value={settings.projectId ?? ''}
            onChange={(event) => {
              const projectId = event.currentTarget.value
              const next = saveSettings(sanityProjectId, dataset, {...settings, projectId})
              setSettings(next)
              if (projectId) {
                setScreen('workflow')
              }
            }}
          >
            <option value="">Select a Hyperlocalise project</option>
            {sessionProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Stack>
      </Box>
    )
  }

  return (
    <Box padding={4}>
      <Stack gap={4}>
        <Flex align="center" justify="space-between">
          <Text size={2} weight="semibold">
            Hyperlocalise
          </Text>
          <Button
            mode="bleed"
            text="Reconnect"
            onClick={() => {
              saveSettings(sanityProjectId, dataset, {
                ...settings,
                accessToken: undefined,
                refreshToken: undefined,
              })
              setScreen('connect')
            }}
          />
        </Flex>
        <Text muted size={1}>
          Studio plugin options: {JSON.stringify(pluginOptions)}
        </Text>
        <Text size={1}>
          Upload, Translate, and Apply for documents will use project{' '}
          <strong>{settings.projectId}</strong> on dataset <strong>{dataset}</strong>.
        </Text>
      </Stack>
    </Box>
  )
}
