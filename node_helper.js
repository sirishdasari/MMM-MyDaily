const NodeHelper = require("node_helper")
const fs = require("node:fs")
const path = require("node:path")

module.exports = NodeHelper.create({
  start() {
    this.config = null
    this.refreshTimer = null
    this.isFetching = false
  },

  socketNotificationReceived(notification, config) {
    if (notification !== "APPWRITE_CONFIG") {
      return
    }

    this.config = config
    clearInterval(this.refreshTimer)
    this.fetchTables()
    const refreshInterval = Number.isInteger(config?.refreshInterval) ? config.refreshInterval : 60 * 1000
    this.refreshTimer = setInterval(() => this.fetchTables(), refreshInterval)
  },

  stop() {
    clearInterval(this.refreshTimer)
  },

  async fetchTables() {
    if (this.isFetching) {
      return
    }

    this.isFetching = true

    try {
      const config = this.config
      const required = ["endpoint", "projectId", "databaseId"]
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
      const tables = []
      let cursorAfter = null

      const headers = {
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": apiKey,
        "Accept": "application/json"
      }

      while (true) {
        const pageUrl = new URL(endpoint)
        pageUrl.pathname = `${basePath}/tablesdb/${encodeURIComponent(config.databaseId)}/tables`
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

        if (!Array.isArray(result.tables)) {
          throw new Error("Appwrite response did not contain a tables array")
        }

        tables.push(...result.tables.map(table => ({
          id: table.$id,
          name: table.name || table.$id
        })))

        if (result.tables.length < 100) {
          break
        }

        const nextCursor = result.tables[result.tables.length - 1].$id
        if (!nextCursor || nextCursor === cursorAfter) {
          throw new Error("Appwrite table pagination did not return a valid next cursor")
        }
        cursorAfter = nextCursor
      }

      this.sendSocketNotification("APPWRITE_TABLES", tables)
    } catch (error) {
      this.sendSocketNotification("APPWRITE_ERROR", error.message)
    } finally {
      this.isFetching = false
    }
  }
})
