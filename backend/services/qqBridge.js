const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { createHash } = require('crypto');
const { pathToFileURL } = require('url');

function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { ...options, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function clonePlainObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : fallback;
}

function trimString(value) {
  return String(value || '').trim();
}

function trimBaseUrl(value) {
  return trimString(value).replace(/\/+$/, '');
}

function isAutoConnectEnabled() {
  return String(process.env.QQBOT_AUTO_CONNECT || '').trim() === '1';
}

function maybeClonePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : null;
}

class QQBridgeManager {
  constructor({
    dataDir,
    qqbotDir,
    getGlobalConfig,
    onDispatch,
    onStatusChange,
  }) {
    this.dataDir = dataDir;
    this.qqbotDir = qqbotDir;
    this.getGlobalConfig = getGlobalConfig;
    this.onDispatch = onDispatch;
    this.onStatusChange = onStatusChange;

    this.modulesPromise = null;
    this.abortController = null;
    this.startTask = null;
    this.status = {
      enabled: false,
      configured: false,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      gatewayUrl: null,
      appId: '',
      accountId: 'default',
      configSignature: '',
    };
  }

  getQQConfig(config = null) {
    const root = config || this.getGlobalConfig?.() || {};
    return root?.thirdPartyChats?.qqbot || {};
  }

  buildAccountConfig(config = null) {
    const qq = this.getQQConfig(config);
    return {
      accountId: 'default',
      name: qq.name || 'QQ Bot',
      enabled: Boolean(qq.enabled),
      appId: String(qq.appId || '').trim(),
      clientSecret: String(qq.clientSecret || '').trim(),
      secretSource: qq.clientSecret ? 'config' : 'none',
      markdownSupport: qq.markdownSupport === true,
      sandbox: qq.sandbox === true,
      config: {
        enabled: Boolean(qq.enabled),
        markdownSupport: qq.markdownSupport === true,
        sandbox: qq.sandbox === true,
        allowFrom: Array.isArray(qq.allowFrom) ? qq.allowFrom : [],
        dmPolicy: qq.dmPolicy || 'open',
        systemPrompt: trimString(qq.systemPrompt || ''),
        imageServerBaseUrl: trimString(qq.imageServerBaseUrl || ''),
        ...(maybeClonePlainObject(qq.audioFormatPolicy) ? { audioFormatPolicy: maybeClonePlainObject(qq.audioFormatPolicy) } : {}),
      },
    };
  }

  buildGatewayConfig(config = null) {
    const root = config || this.getGlobalConfig?.() || {};
    const qq = this.getQQConfig(root);
    const providerCatalog = clonePlainObject(root.models?.providers, {});
    const fallbackProviderId = 'global-default';
    const fallbackBaseUrl = trimBaseUrl(root.customApiBaseUrl || root.apiBaseUrl);
    const fallbackApiKey = trimString(root.customApiKey || root.apiKey);
    const fallbackSttModel = trimString(qq.stt?.model || root.audioTranscriptionModel || 'whisper-1') || 'whisper-1';

    if (fallbackBaseUrl && fallbackApiKey) {
      providerCatalog[fallbackProviderId] = {
        ...(providerCatalog[fallbackProviderId] || {}),
        baseUrl: fallbackBaseUrl,
        apiKey: fallbackApiKey,
      };
    }

    const qqStt = maybeClonePlainObject(qq.stt);
    const normalizedStt = qqStt
      ? {
          ...qqStt,
          ...(!trimString(qqStt.provider) && fallbackBaseUrl && fallbackApiKey && (!trimBaseUrl(qqStt.baseUrl) || !trimString(qqStt.apiKey))
            ? { provider: fallbackProviderId }
            : {}),
        }
      : null;
    const derivedStt = !normalizedStt && fallbackBaseUrl && fallbackApiKey
      ? {
          enabled: true,
          provider: fallbackProviderId,
          model: fallbackSttModel,
        }
      : null;

    const qqTts = maybeClonePlainObject(qq.tts);
    const qqAudioFormatPolicy = maybeClonePlainObject(qq.audioFormatPolicy);
    const audioModels = Array.isArray(root.tools?.media?.audio?.models)
      ? root.tools.media.audio.models.map(item => ({ ...item }))
      : [];

    if (audioModels.length === 0 && derivedStt) {
      audioModels.push({
        provider: fallbackProviderId,
        model: fallbackSttModel,
      });
    }

    return {
      channels: {
        qqbot: {
          enabled: Boolean(qq.enabled),
          appId: trimString(qq.appId),
          clientSecret: trimString(qq.clientSecret),
          markdownSupport: qq.markdownSupport === true,
          sandbox: qq.sandbox === true,
          allowFrom: Array.isArray(qq.allowFrom) ? qq.allowFrom : [],
          dmPolicy: qq.dmPolicy || 'open',
          systemPrompt: trimString(qq.systemPrompt || ''),
          imageServerBaseUrl: trimString(qq.imageServerBaseUrl || ''),
          ...(qqAudioFormatPolicy ? { audioFormatPolicy: qqAudioFormatPolicy } : {}),
          ...(normalizedStt || derivedStt ? { stt: normalizedStt || derivedStt } : {}),
          ...(qqTts ? { tts: qqTts } : {}),
        },
      },
      thirdPartyChats: {
        qqbot: {
          enabled: Boolean(qq.enabled),
        },
      },
      ...(root.messages ? { messages: { ...root.messages } } : {}),
      ...(Object.keys(providerCatalog).length > 0 || root.models ? {
        models: {
          ...(clonePlainObject(root.models, {})),
          providers: providerCatalog,
        },
      } : {}),
      ...((audioModels.length > 0 || root.tools?.media?.audio || root.tools?.media) ? {
        tools: {
          ...(clonePlainObject(root.tools, {})),
          media: {
            ...(clonePlainObject(root.tools?.media, {})),
            audio: {
              ...(clonePlainObject(root.tools?.media?.audio, {})),
              ...(audioModels.length > 0 ? { models: audioModels } : {}),
            },
          },
        },
      } : {}),
    };
  }

  buildStatusPatch(config = null, patch = {}) {
    const account = this.buildAccountConfig(config);
    const signature = createHash('sha256')
      .update(JSON.stringify(this.buildGatewayConfig(config)))
      .digest('hex');
    return {
      enabled: Boolean(account.enabled),
      configured: Boolean(account.appId && account.clientSecret),
      appId: account.appId,
      accountId: account.accountId,
      configSignature: signature,
      ...patch,
    };
  }

  updateStatus(patch = {}, config = null) {
    this.status = {
      ...this.status,
      ...this.buildStatusPatch(config, patch),
    };
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(this.getStatus());
    }
  }

  getStatus(config = null) {
    return {
      ...this.buildStatusPatch(config, {}),
      ...this.status,
    };
  }

  async ensureModules() {
    if (!this.modulesPromise) {
      this.modulesPromise = this.loadModules().catch(error => {
        this.modulesPromise = null;
        throw error;
      });
    }
    return this.modulesPromise;
  }

  async loadModules() {
    const distGatewayPath = path.join(this.qqbotDir, 'dist', 'src', 'gateway.js');
    const distRuntimePath = path.join(this.qqbotDir, 'dist', 'src', 'runtime.js');
    const distApiPath = path.join(this.qqbotDir, 'dist', 'src', 'api.js');

    if (!(await fs.pathExists(distGatewayPath)) || !(await fs.pathExists(distRuntimePath)) || !(await fs.pathExists(distApiPath))) {
      try {
        await execAsync('node ./node_modules/typescript/bin/tsc -p tsconfig.json', {
          cwd: this.qqbotDir,
          timeout: 120000,
        });
      } catch (error) {
        const hasDist = (await fs.pathExists(distGatewayPath)) && (await fs.pathExists(distRuntimePath)) && (await fs.pathExists(distApiPath));
        if (!hasDist) {
          throw error;
        }
      }
    }

    const [gatewayModule, runtimeModule, apiModule] = await Promise.all([
      import(pathToFileURL(distGatewayPath).href),
      import(pathToFileURL(distRuntimePath).href),
      import(pathToFileURL(distApiPath).href),
    ]);

    return {
      startGateway: gatewayModule.startGateway,
      setQQBotRuntime: runtimeModule.setQQBotRuntime,
      initApiConfig: apiModule.initApiConfig,
      getAccessToken: apiModule.getAccessToken,
      getGatewayUrl: apiModule.getGatewayUrl,
    };
  }

  createRuntime(globalConfig = null) {
    const runtimeConfig = this.buildGatewayConfig(globalConfig);

    return {
      getConfig: () => runtimeConfig,
      setConfig: () => {},
      getDataDir: () => this.dataDir,
      log: {
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args),
        debug: (...args) => console.debug(...args),
      },
      channel: {
        activity: {
          record: (payload = {}) => {
            const direction = String(payload?.direction || '').toLowerCase();
            if (direction === 'inbound') {
              this.updateStatus({ lastInboundAt: Date.now() }, globalConfig);
            }
            if (direction === 'outbound') {
              this.updateStatus({ lastOutboundAt: Date.now() }, globalConfig);
            }
          },
        },
        routing: {
          resolveAgentRoute: ({ accountId = 'default', peer = {} } = {}) => ({
            sessionKey: `qqbot:${accountId}:${peer.kind || 'direct'}:${peer.id || 'unknown'}`,
            accountId,
            agentId: 'local-agent',
          }),
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatInboundEnvelope: ({ body = '' } = {}) => body,
          finalizeInboundContext: (payload = {}) => payload,
          resolveEffectiveMessagesConfig: () => ({ responsePrefix: '' }),
          dispatchReplyWithBufferedBlockDispatcher: async ({ ctx, cfg, dispatcherOptions = {} }) => {
            if (typeof this.onDispatch !== 'function') {
              return;
            }
            const wrappedDeliver = async (payload, info = { kind: 'block' }) => {
              this.updateStatus({ lastOutboundAt: Date.now() }, globalConfig);
              if (typeof dispatcherOptions.deliver === 'function') {
                await dispatcherOptions.deliver(payload, info);
              }
            };
            await this.onDispatch({
              ctx,
              cfg,
              deliver: wrappedDeliver,
              status: this.getStatus(globalConfig),
            });
          },
        },
      },
      config: {
        writeConfigFile: async () => {},
      },
    };
  }

  async testConnection(config = null) {
    const account = this.buildAccountConfig(config);
    if (!account.appId || !account.clientSecret) {
      return {
        ok: false,
        error: 'QQ Bot is not fully configured.',
        ...this.getStatus(config),
      };
    }

    const modules = await this.ensureModules();
    modules.initApiConfig({
      markdownSupport: account.markdownSupport,
      sandbox: account.sandbox,
    });

    try {
      const token = await modules.getAccessToken(account.appId, account.clientSecret);
      const gatewayUrl = await modules.getGatewayUrl(token);
      const liveStatus = this.getStatus(config);
      return {
        ...liveStatus,
        ok: Boolean(liveStatus.connected),
        authOk: true,
        gatewayUrl: liveStatus.gatewayUrl || gatewayUrl,
        error: liveStatus.lastError || null,
      };
    } catch (error) {
      const liveStatus = this.getStatus(config);
      return {
        ...liveStatus,
        ok: Boolean(liveStatus.connected),
        authOk: false,
        error: liveStatus.lastError || error.message,
      };
    }
  }

  async stop(config = null) {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.startTask = null;
    this.updateStatus({
      running: false,
      connected: false,
      gatewayUrl: null,
    }, config);
  }

  async start(config = null) {
    const globalConfig = config || this.getGlobalConfig?.() || {};
    const account = this.buildAccountConfig(globalConfig);

    await this.stop(globalConfig);

    if (!account.enabled || !account.appId || !account.clientSecret) {
      this.updateStatus({
        running: false,
        connected: false,
        lastError: null,
      }, globalConfig);
      return this.getStatus(globalConfig);
    }

    const modules = await this.ensureModules();
    const runtime = this.createRuntime(globalConfig);
    modules.setQQBotRuntime(runtime);
    modules.initApiConfig({
      markdownSupport: account.markdownSupport,
      sandbox: account.sandbox,
    });

    this.abortController = new AbortController();
    this.updateStatus({
      running: true,
      connected: false,
      lastError: null,
      gatewayUrl: null,
    }, globalConfig);

    this.startTask = modules.startGateway({
      account,
      abortSignal: this.abortController.signal,
      cfg: this.buildGatewayConfig(globalConfig),
      log: {
        info: (msg) => console.log(msg),
        warn: (msg) => console.warn(msg),
        error: (msg) => console.error(msg),
        debug: (msg) => console.debug(msg),
      },
      onReady: (data) => {
        this.updateStatus({
          connected: true,
          lastConnectedAt: Date.now(),
          gatewayUrl: data?.url || data?.gatewayUrl || this.status.gatewayUrl,
          lastError: null,
        }, globalConfig);
      },
      onError: (error) => {
        this.updateStatus({
          connected: false,
          lastError: error?.message || String(error),
        }, globalConfig);
      },
    }).catch(error => {
      if (this.abortController?.signal.aborted) {
        return;
      }
      this.updateStatus({
        running: false,
        connected: false,
        lastError: error.message,
      }, globalConfig);
    });

    return this.getStatus(globalConfig);
  }

  async syncWithConfig(config = null) {
    const globalConfig = config || this.getGlobalConfig?.() || {};
    const account = this.buildAccountConfig(globalConfig);
    this.updateStatus({}, globalConfig);

    if (!account.enabled || !account.appId || !account.clientSecret) {
      await this.stop(globalConfig);
      return this.getStatus(globalConfig);
    }

    if (!isAutoConnectEnabled()) {
      await this.stop(globalConfig);
      this.updateStatus({
        running: false,
        connected: false,
        lastError: 'QQ Bot auto-connect is disabled by default for startup stability. Set QQBOT_AUTO_CONNECT=1 to enable it.',
      }, globalConfig);
      return this.getStatus(globalConfig);
    }

    const current = this.getStatus(globalConfig);
    const shouldRestart =
      !current.running ||
      current.appId !== account.appId ||
      current.enabled !== account.enabled ||
      current.configSignature !== this.buildStatusPatch(globalConfig).configSignature;

    if (shouldRestart) {
      return this.start(globalConfig);
    }

    return current;
  }
}

module.exports = { QQBridgeManager };
