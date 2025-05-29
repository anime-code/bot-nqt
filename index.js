const {Client, GatewayIntentBits, Partials, SlashCommandBuilder} = require('discord.js');
const schedule = require('node-schedule');
const winston = require('winston');
require('dotenv').config();
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        winston.format.printf(({timestamp, level, message}) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({filename: 'bot.log'}),
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
            logger.error(`❌ Lỗi khi gửi tin nhắn (lần ${i + 1}/${retries}): ${err.message}`);
            if (i < retries - 1) {
                logger.info(`⏳ Thử lại sau ${delay / 1000} giây...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return false;
};
const reminders = [
    {time: '0 */2 * * * *', message: 'Bắt đầu ASAKAI thôi mọi người!'},
    {time: '0 */2 * * * *', message: 'Nhớ đừng quên daily report nhé: https://work-report.thk-hd-hn.vn/'},
];

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);

    const channel = client.channels.cache.get(process.env.CHANNEL_ID);

    if (!channel) {
        console.error('❌ Không tìm thấy kênh! Kiểm tra lại CHANNEL_ID.');
        return;
    }

    reminders.forEach((reminder, index) => {
        schedule.scheduleJob(`reminder-${index}`, reminder.time, async () => {
            logger.info(`⏰ Đang chạy lịch trình nhắc nhở ${index + 1} vào ${new Date().toString()}`);
            const success = await retrySendMessage(channel, `@everyone ${reminder.message}`);
            if (success) {
                logger.info(`✅ Đã gửi nhắc nhở: ${reminder.message}`);
            } else {
                logger.error(`❌ Không thể gửi nhắc nhở sau nhiều lần thử: ${reminder.message}`);
            }
        });
        logger.info(`📅 Đã lên lịch nhắc nhở ${index + 1} vào ${reminder.time}`);
    });
    // Đăng ký lệnh slash (tùy chọn)
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
            content: `✅ Bot đang hoạt động! Hiện tại có ${reminders.length} nhắc nhở được lên lịch. Múi giờ: ${new Date().toString()}`,
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