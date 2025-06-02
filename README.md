# Discord Bot

A Discord bot for sending scheduled reminders and logging status.

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd discord-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add the following:
   ```
   DISCORD_TOKEN=your_discord_token_here
   CHANNEL_ID=your_channel_id_here
   LOG_CHANNEL_ID=your_log_channel_id_here
   PORT=3000
   ```

4. Run the bot:
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## Features

- Scheduled reminders for ASAKAI, lunch, and daily reports.
- Logging to console, file (`bot.log`), and a Discord channel.
- Slash command `/status` to check bot status.
- Express server for monitoring bot status.

## Folder Structure

- `src/config/`: Configuration files.
- `src/handlers/`: Command and event handlers.
- `src/schedules/`: Scheduled tasks (reminders, logging).
- `src/utils/`: Utility functions.
- `src/index.js`: Main bot entry point.
- `src/server.js`: Express server.

## Dependencies

- `discord.js`: Discord API client.
- `dotenv`: Environment variables.
- `express`: HTTP server.
- `node-schedule`: Task scheduling.
- `winston`: Logging.

## License

MIT