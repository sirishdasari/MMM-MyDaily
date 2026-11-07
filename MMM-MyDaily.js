Module.register("MMM-MyDaily", {
  defaults: {
    endpoint: "",
    projectId: "",
    databaseId: "",
    tableId: "todo_db",
    taskField: "title",
    taskDetailsField: "",
    apiKeyEnv: "APPWRITE_API_KEY",
    refreshInterval: 60 * 1000,
    slideInterval: 20000,
    fadeDuration: 1000
  },

  getStyles() {
    return ["MMM-MyDaily.css"]
  },

  start() {
    this.tasks = []
    this.error = null
    this.loaded = false
    this.currentSlide = 0
    this.instanceId = this.identifier
    this.sendSocketNotification("APPWRITE_CONFIG", {
      instanceId: this.instanceId,
      config: this.config
    })
    this.slideTimer = setInterval(() => {
      if (!this.loaded || this.error) {
        return
      }

      this.currentSlide = (this.currentSlide + 1) % this.getSlides().length
      this.updateDom(this.config.fadeDuration)
    }, this.config.slideInterval)
  },

  stop() {
    clearInterval(this.slideTimer)
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

  getSlides() {
    const tasks = Array.isArray(this.tasks) ? this.tasks : []
    const overdueTasks = tasks.filter((task) => {
      const dueDate = task.dueDate ? Date.parse(task.dueDate) : NaN
      return !task.completed && Number.isFinite(dueDate) && dueDate < Date.now()
    })
    const latestStandup = tasks
      .filter(task => task.title.trim().toLowerCase() === "daily standup")
      .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""))[0]

    return [
      { heading: "All Tasks", tasks },
      { heading: "Overdue", tasks: overdueTasks },
      { heading: "Daily Standup", standup: latestStandup }
    ]
  },

  getHeader() {
    return this.getSlides()[this.currentSlide]?.heading || "Tasks"
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

    const slide = this.getSlides()[this.currentSlide]
    if (slide.standup) {
      const description = document.createElement("div")
      description.className = "small appwrite-standup"
      description.textContent = slide.standup.details || "No description available."
      wrapper.appendChild(description)
      return wrapper
    }

    if (slide.tasks.length === 0) {
      wrapper.textContent = slide.heading === "Overdue" ? "No overdue tasks." : "No tasks found."
      return wrapper
    }

    const list = document.createElement("ul")
    list.className = "small appwrite-list"

    slide.tasks.forEach((task) => {
      const item = document.createElement("li")
      item.textContent = task.title
      list.appendChild(item)
    })

    wrapper.appendChild(list)

    return wrapper
  }
})
