# MMM-MyDaily

This MagicMirror module rotates through all tasks, overdue tasks, and the description from the latest "Daily standup" row in an Appwrite TablesDB table. It uses Appwrite's REST API from MagicMirror's Node.js helper, so API keys are never sent to the browser.

## Raspberry Pi setup

From your MagicMirror installation directory:

```bash
git clone https://github.com/sirishdasari/MMM-MyDaily.git modules/MMM-MyDaily
cd modules/MMM-MyDaily
read -rsp "Appwrite API key: " APPWRITE_API_KEY
printf '\n'
printf 'APPWRITE_API_KEY=%s\n' "$APPWRITE_API_KEY" > .env
unset APPWRITE_API_KEY
chmod 600 .env
```

The module uses `APPWRITE_API_KEY` from the process environment first. If it is not set, it loads the ignored `.env` file in the module directory, which works with Raspberry Pi startup services that do not inherit shell variables. Keep the key private; do not commit `.env` or paste the key into `config.js`.

Create an Appwrite API key with the `rows.read` scope, then configure the Appwrite endpoint, project ID, database ID, table ID, and task text field in your MagicMirror `config/config.js`:

```js
{
	module: "MMM-MyDaily",
	position: "top_center",
	config: {
		endpoint: "https://<REGION>.cloud.appwrite.io/v1",
		projectId: "YOUR_PROJECT_ID",
		databaseId: "YOUR_DATABASE_ID",
		tableId: "todo_db",
		taskField: "title",
		apiKeyEnv: "APPWRITE_API_KEY",
		refreshInterval: 60 * 1000,
		slideInterval: 20000,
		fadeDuration: 1000
	}
}
```

`apiKeyEnv` is the name of the server-side environment variable containing the key; it is not the key itself. `endpoint` must be your Appwrite API endpoint and include `/v1`. `tableId` is the table's ID, and `taskField` is the string field used as the task title. The module displays all rows on the first slide, incomplete rows with a past `dueDate` on the second slide, and the `description` of the newest row titled "Daily standup" on the third slide. The newest standup is determined by Appwrite's `$createdAt` value. `slideInterval` and `fadeDuration` are in milliseconds. Rows are retrieved in pages of 100; `refreshInterval` controls how often they refresh. Restart MagicMirror after creating or changing `.env` or the environment variable.

Alternatively, export the variable before starting MagicMirror:

```bash
export APPWRITE_API_KEY='YOUR_APPWRITE_API_KEY'
cd ~/MagicMirror
npm start
```

The module reports configuration and API errors on screen. Successful responses display each task as a list item.
