const NodeHelper = require("node_helper")
const fs = require("node:fs")
const path = require("node:path")

module.exports = NodeHelper.create({
  start() {
    this.instances = new Map()
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "APPWRITE_CONFIG") {
      this.configureInstance(payload)
    } else if (notification === "APPWRITE_STOP") {
      this.stopInstance(payload?.instanceId)
    }
  },

  configureInstance(payload) {
    if (!payload?.instanceId || !payload.config) {
      return
    }

    const existing = this.instances.get(payload.instanceId)
    if (existing) {
      clearInterval(existing.refreshTimer)
      existing.config = payload.config
      existing.version++
    } else {
      this.instances.set(payload.instanceId, {
        config: payload.config,
        refreshTimer: null,
        isFetching: false,
        version: 0
      })
    }

    const instance = this.instances.get(payload.instanceId)
    this.fetchTasks(payload.instanceId)
    const refreshInterval = Number.isInteger(instance.config.refreshInterval) ? instance.config.refreshInterval : 60 * 1000
    instance.refreshTimer = setInterval(() => this.fetchTasks(payload.instanceId), refreshInterval)
  },

  stop() {
    for (const instanceId of this.instances.keys()) {
      this.stopInstance(instanceId)
    }
  },

  stopInstance(instanceId) {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return
    }

    clearInterval(instance.refreshTimer)
    this.instances.delete(instanceId)
  },

  async fetchTasks(instanceId) {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.isFetching) {
      return
    }

    instance.isFetching = true
    const { config, version } = instance

    try {
      const required = ["endpoint", "projectId", "databaseId", "tableId", "taskField"]
      const missing = required.filter(key => !config?.[key])
      if (missing.length) {
        throw new Error(`Missing module configuration: ${missing.join(", ")}`)
      }

      const apiKeyEnv = config.apiKeyEnv || "APPWRITE_API_KEY"
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
        throw new Error("apiKeyEnv must be a valid environment variable name")
      }

      const envPath = path.join(__dirname, ".env")
      if (!process.env[apiKeyEnv] && fs.existsSync(envPath)) {
        process.loadEnvFile(envPath)
      }

      const apiKey = process.env[apiKeyEnv]
      if (!apiKey) {
        throw new Error(`${apiKeyEnv} environment variable is required`)
      }

      if (!Number.isInteger(config.refreshInterval) || config.refreshInterval < 1000) {
        throw new Error("refreshInterval must be at least 1000 milliseconds")
      }

      const endpoint = new URL(config.endpoint)
      if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error("Appwrite endpoint must be an HTTPS URL without credentials, query, or fragment")
      }

      const basePath = endpoint.pathname.replace(/\/+$/, "")
      const tasks = []
      let cursorAfter = null

      const headers = {
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": apiKey,
        "Accept": "application/json"
      }

      while (true) {
        const pageUrl = new URL(endpoint)
        pageUrl.pathname = `${basePath}/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(config.tableId)}/rows`
        pageUrl.searchParams.set("limit", "100")
        if (cursorAfter) {
          pageUrl.searchParams.set("cursorAfter", cursorAfter)
        }

        const response = await fetch(pageUrl, {
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(15000)
        })
        const responseText = await response.text()
        let result
        try {
          result = JSON.parse(responseText)
        } catch {
          throw new Error(`Appwrite returned an invalid response (HTTP ${response.status})`)
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${result.message || "Appwrite request failed"}`)
        }

        if (!Array.isArray(result.rows)) {
          throw new Error("Appwrite response did not contain a rows array")
        }

        tasks.push(...result.rows.map((row) => {
          const title = row[config.taskField]
          if (typeof title !== "string") {
            throw new Error(`Appwrite task row ${row.$id || "(unknown)"} is missing string field "${config.taskField}"`)
          }
          const details = config.taskDetailsField ? row[config.taskDetailsField] : null
          return {
            id: row.$id,
            title,
            details: typeof details === "string" ? details : null,
            dueDate: typeof row.dueDate === "string" ? row.dueDate : null,
            completed: row.completed === true,
            createdAt: typeof row.$createdAt === "string" ? row.$createdAt : null
          }
        }))

        if (result.rows.length < 100) {
          break
        }

        const nextCursor = result.rows[result.rows.length - 1].$id
        if (!nextCursor || nextCursor === cursorAfter) {
          throw new Error("Appwrite task pagination did not return a valid next cursor")
        }
        cursorAfter = nextCursor
      }

      if (this.instances.get(instanceId) === instance && instance.version === version) {
        this.sendSocketNotification("APPWRITE_TASKS", { instanceId, tasks })
      }
    } catch (error) {
      if (this.instances.get(instanceId) === instance && instance.version === version) {
        this.sendSocketNotification("APPWRITE_ERROR", { instanceId, error: error.message })
      }
    } finally {
      instance.isFetching = false
      if (this.instances.get(instanceId) === instance && instance.version !== version) {
        this.fetchTasks(instanceId)
      }
    }
  }
})
