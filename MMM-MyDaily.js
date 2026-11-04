Module.register("MMM-MyDaily", {
  defaults: {
    endpoint: "",
    projectId: "",
    databaseId: "",
    apiKeyEnv: "APPWRITE_API_KEY",
    refreshInterval: 60 * 1000
  },

  getStyles() {
    return ["MMM-MyDaily.css"]
  },

  start() {
    this.tables = []
    this.error = null
    this.loaded = false
    this.sendSocketNotification("APPWRITE_CONFIG", this.config)
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "APPWRITE_TABLES") {
      this.tables = payload
      this.error = null
      this.loaded = true
      this.updateDom()
    } else if (notification === "APPWRITE_ERROR") {
      this.error = payload
      this.loaded = true
      this.updateDom()
    }
  },

  getDom() {
    const wrapper = document.createElement("div")
    wrapper.className = "MMM-MyDaily"

    if (this.error) {
      wrapper.textContent = `Appwrite error: ${this.error}`
      return wrapper
    }

    if (!this.loaded) {
      wrapper.textContent = "Loading Appwrite tables..."
      return wrapper
    }

    if (this.tables.length === 0) {
      wrapper.textContent = "No tables found in this Appwrite database."
      return wrapper
    }

    const list = document.createElement("ul")
    list.className = "small appwrite-list"

    this.tables.forEach((table) => {
      const item = document.createElement("li")
      item.textContent = `${table.name} (${table.id})`
      list.appendChild(item)
    })

    wrapper.appendChild(list)

    return wrapper
  }
})
