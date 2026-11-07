Module.register("MMM-MyDaily", {
  defaults: {
    endpoint: "",
    projectId: "",
    databaseId: "",
    tableId: "todo_db",
    taskField: "title",
    taskDetailsField: "",
    queries: [{ method: "equal", attribute: "completed", values: [false] }],
    apiKeyEnv: "APPWRITE_API_KEY",
    refreshInterval: 60 * 1000
  },

  getStyles() {
    return ["MMM-MyDaily.css"]
  },

  start() {
    this.tasks = []
    this.error = null
    this.loaded = false
    this.instanceId = this.identifier
    this.sendSocketNotification("APPWRITE_CONFIG", {
      instanceId: this.instanceId,
      config: this.config
    })
  },

  stop() {
    this.sendSocketNotification("APPWRITE_STOP", { instanceId: this.instanceId })
  },

  socketNotificationReceived(notification, payload) {
    if (payload?.instanceId !== this.instanceId) {
      return
    }

    if (notification === "APPWRITE_TASKS") {
      this.tasks = payload.tasks
      this.error = null
      this.loaded = true
      this.updateDom()
    } else if (notification === "APPWRITE_ERROR") {
      this.error = payload.error
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
      wrapper.textContent = "Loading tasks..."
      return wrapper
    }

    if (this.tasks.length === 0) {
      wrapper.textContent = "No tasks found."
      return wrapper
    }

    const list = document.createElement("ul")
    list.className = "small appwrite-list"

    this.tasks.forEach((task) => {
      const item = document.createElement("li")
      item.textContent = task.title
      if (task.details) {
        const details = document.createElement("div")
        details.className = "dimmed small"
        details.textContent = task.details
        item.appendChild(details)
      }
      list.appendChild(item)
    })

    wrapper.appendChild(list)

    return wrapper
  }
})
