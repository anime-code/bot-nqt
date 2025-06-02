const { Client, GatewayIntentBits, Partials } = require('discord.js');
const winston = require('winston');
const schedule = require('node-schedule');
const config = require('./config/config');
const DiscordTransport = require('./utils/discordTransport');
const retrySendMessage = require('./utils/retrySend');
const reminders = require('./schedules/reminders');
const scheduleLogger = require('./schedules/logger');
const { registerCommands, handleCommands } = require('./handlers/commands');
const handleEvents = require('./handlers/events');
const startServer = require('./server');

// Khởi tạo logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' }),
        new DiscordTransport({ level: 'info' }),
    ],
});

// Khởi tạo client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

client.once('ready', async () => {
    logger.info(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    logger.info(`⏰ Thời gian hiện tại khi khởi động: ${new Date().toString()}`);

    const channel = client.channels.cache.get(config.CHANNEL_ID);
    const logChannel = client.channels.cache.get(config.LOG_CHANNEL_ID);

    if (!channel) {
        logger.error('❌ Không tìm thấy kênh chính! Kiểm tra lại CHANNEL_ID.');
        return;
    }

    if (!logChannel) {
        logger.error('❌ Không tìm thấy kênh log! Kiểm tra lại LOG_CHANNEL_ID.');
    } else {
        logger.transports.find(transport => transport instanceof DiscordTransport).logChannel = logChannel;
    }

    // Lên lịch log trạng thái
    scheduleLogger(logger, logChannel, reminders);

    // Lên lịch nhắc nhở
    reminders.forEach((reminder, index) => {
        schedule.scheduleJob(`reminder-${index}`, reminder.time, async () => {
            logger.info(`⏰ Đang chạy lịch trình nhắc nhở ${index + 1} vào ${new Date().toString()}`);
            logger.info(`🔍 Kênh chính: ${channel ? channel.id : 'Không tìm thấy'}`);
            const success = await retrySendMessage(channel, reminder.embed());
            if (success) {
                logger.info(`✅ Đã gửi nhắc nhở: ${reminder.embed().data.description}`);
            } else {
                logger.error(`❌ Không thể gửi nhắc nhở sau nhiều lần thử`);
            }
        });
        logger.info(`📅 Đã lên lịch nhắc nhở ${index + 1} vào ${reminder.time}`);
    });

    // Đăng ký lệnh slash
    await registerCommands(client, logger);
});

// Xử lý lệnh slash
client.on('interactionCreate', async (interaction) => {
    await handleCommands(interaction, logger, reminders);
});

// Xử lý sự kiện
handleEvents(client, logger);

// Đăng nhập bot
const loginBot = async () => {
    try {
        if (!config.DISCORD_TOKEN) {
            logger.error('❌ DISCORD_TOKEN không được tìm thấy trong file .env!');
            process.exit(1);
        }
        if (!config.LOG_CHANNEL_ID) {
            logger.error('❌ LOG_CHANNEL_ID không được tìm thấy trong file .env!');
        }
        await client.login(config.DISCORD_TOKEN);
        logger.info('✅ Đăng nhập bot thành công');
    } catch (err) {
        logger.error(`❌ Lỗi đăng nhập bot: ${err.message}`);
        process.exit(1);
    }
};
loginBot();

// Khởi động server Express
startServer(logger);

// Xử lý khi bot bị tắt
process.on('SIGINT', () => {
    logger.info('📴 Bot đang tắt...');
    schedule.gracefulShutdown().then(() => {
        logger.info('📅 Đã hủy tất cả lịch trình');
        client.destroy();
        process.exit(0);
    });
});