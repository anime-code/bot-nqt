const { Client, GatewayIntentBits, Partials, SlashCommandBuilder } = require('discord.js');
const schedule = require('node-schedule');
const winston = require('winston');
require('dotenv').config();

// Custom transport để gửi log tới Discord
class DiscordTransport extends winston.transports.Console {
    constructor(options) {
        super(options);
        this.name = 'discord';
        this.level = options.level || 'info';
    }

    async log(info, callback) {
        const { timestamp, level, message } = info;
        const logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (this.logChannel) {
            try {
                await this.logChannel.send(logMessage);
            } catch (err) {
                console.error(`❌ Lỗi khi gửi log tới Discord: ${err.message}`);
            }
        }
        callback();
    }
}

// Khởi tạo logger với DiscordTransport
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

const retrySendMessage = async (channel, message, retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await channel.send(message);
            return true;
        } catch (err) {
            logger.error(`❌ Lỗi khi gửi tin nhắn (lần ${i + 1}/${retries}): ${err.message}, Channel ID: ${channel?.id || 'Không xác định'}`);
            if (i < retries - 1) {
                logger.info(`⏳ Thử lại sau ${delay / 1000} giây...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return false;
};

const reminders = [
    { time: '0 59 8 * * 1-5', message: 'Bắt đầu ASAKAI thôi mọi người!' }, // 08:59 thứ 2-6
    { time: '0 0 12 * * 1-5', message: 'Nghỉ trưa thôi mọi người' }, // 12:00 thứ 2-6
    { time: '0 50 13 * * 1-5', message: 'Chuẩn bị Nghỉ trưa thôi mọi người' }, // 13:41 thứ 2-6
    { time: '0 45 16 * * 1-5', message: 'Nhớ đừng quên daily report nhé: https://work-report.thk-hd-hn.vn/' }, // 16:45 thứ 2-6
];

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    logger.info(`⏰ Thời gian hiện tại khi khởi động: ${new Date().toString()}`);

    const channel = client.channels.cache.get(process.env.CHANNEL_ID);
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);

    if (!channel) {
        console.error('❌ Không tìm thấy kênh chính! Kiểm tra lại CHANNEL_ID.');
        logger.error('❌ Không tìm thấy kênh chính! Kiểm tra lại CHANNEL_ID.');
        return;
    }

    if (!logChannel) {
        console.error('❌ Không tìm thấy kênh log! Kiểm tra lại LOG_CHANNEL_ID.');
        logger.error('❌ Không tìm thấy kênh log! Kiểm tra lại LOG_CHANNEL_ID.');
    } else {
        logger.transports.find(transport => transport instanceof DiscordTransport).logChannel = logChannel;
    }

    // Lên lịch gửi log mỗi 5 phút
    schedule.scheduleJob('log-every-5-minutes', '*/5 * * * *', async () => {
        if (logChannel) {
            const logMessage = `📊 [STATUS] Bot đang hoạt động. Số nhắc nhở: ${reminders.length}. Thời gian: ${new Date().toString()}`;
            const success = await retrySendMessage(logChannel, logMessage);
            if (success) {
                logger.info(`✅ Đã gửi log trạng thái định kỳ`);
            } else {
                logger.error(`❌ Không thể gửi log trạng thái định kỳ`);
            }
        }
    });
    logger.info('📅 Đã lên lịchrasng log trạng thái mỗi 5 phút');

    // Lên lịch các nhắc nhở
    reminders.forEach((reminder, index) => {
        schedule.scheduleJob(`reminder-${index}`, reminder.time, async () => {
            logger.info(`⏰ Đang chạy lịch trình nhắc nhở ${index + 1} vào ${new Date().toString()}`);
            logger.info(`🔍 Kênh chính: ${channel ? channel.id : 'Không tìm thấy'}`);
            const success = await retrySendMessage(channel, `@everyone ${reminder.message}`);
            if (success) {
                logger.info(`✅ Đã gửi nhắc nhở: ${reminder.message}`);
            } else {
                logger.error(`❌ Không thể gửi nhắc nhở sau nhiều lần thử: ${reminder.message}`);
            }
        });
        logger.info(`📅 Đã lên lịch nhắc nhở ${index + 1} vào ${reminder.time}`);
    });

    // Đăng ký lệnh slash
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Kiểm tra trạng thái của bot'),
        ];
        await client.application.commands.set(commands);
        logger.info('✅ Đã đăng ký lệnh slash');
    } catch (err) {
        logger.error(`❌ Lỗi khi đăng ký lệnh slash: ${err.message}`);
    }
});

// Xử lý lệnh slash
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'status') {
        await interaction.reply({
            content: `✅ Bot đang hoạt động! Hiện tại có ${reminders.length} nhắc nhở được lên lịch. Thời gian: ${new Date().toString()}`,
            ephemeral: true,
        });
        logger.info(`📡 Lệnh /status được gọi bởi ${interaction.user.tag}`);
    }
});

// Xử lý lỗi
client.on('error', (err) => {
    logger.error(`❌ Lỗi client Discord: ${err.message}`);
});

client.on('disconnect', () => {
    logger.warn('⚠ Bot đã ngắt kết nối, đang thử kết nối lại...');
});

client.on('reconnecting', () => {
    logger.info('🔄 Bot đang kết nối lại...');
});

// Đăng nhập bot
const loginBot = async () => {
    try {
        if (!process.env.DISCORD_TOKEN) {
            logger.error('❌ DISCORD_TOKEN không được tìm thấy trong file .env!');
            process.exit(1);
        }
        if (!process.env.LOG_CHANNEL_ID) {
            logger.error('❌ LOG_CHANNEL_ID không được tìm thấy trong file .env!');
        }
        await client.login(process.env.DISCORD_TOKEN);
        logger.info('✅ Đăng nhập bot thành công');
    } catch (err) {
        logger.error(`❌ Lỗi đăng nhập bot: ${err.message}`);
        process.exit(1);
    }
};
loginBot();

// Express server
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot đang chạy!'));

app.listen(PORT, () => {
    logger.info(`✅ Server Express chạy trên port ${PORT}`);
});

// Xử lý khi bot bị tắt
process.on('SIGINT', () => {
    logger.info('📴 Bot đang tắt...');
    schedule.gracefulShutdown().then(() => {
        logger.info('📅 Đã hủy tất cả lịch trình');
        client.destroy();
        process.exit(0);
    });
});