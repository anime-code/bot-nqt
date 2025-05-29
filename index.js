// index.js

const { Client, GatewayIntentBits, Partials, SlashCommandBuilder } = require('discord.js');
const schedule = require('node-schedule-tz');
const winston = require('winston');
require('dotenv').config();

// Ép buộc múi giờ toàn cục
process.env.TZ = 'Asia/Ho_Chi_Minh';

// Cấu hình logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' }),
    ],
});

// Khởi tạo client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

// Danh sách nhắc nhở - Gửi mỗi phút
const reminders = [
    { time: '* * * * * *', message: 'Bắt đầu ASAKAI thôi mọi người!', tz: 'Asia/Ho_Chi_Minh' }, // Mỗi phút
    { time: '* * * * * *', message: 'Nhớ đừng quên daily report nhé: https://work-report.thk-hd-hn.vn/', tz: 'Asia/Ho_Chi_Minh' }, // Mỗi phút
];

// Khi bot đã sẵn sàng
client.once('ready', async () => {
    logger.info(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    logger.info(`🌐 Múi giờ hệ thống hiện tại: ${new Date().toString()}`);

    // Kiểm tra CHANNEL_ID
    const channel = client.channels.cache.get(process.env.CHANNEL_ID);
    if (!channel) {
        logger.error('❌ Không tìm thấy kênh! Kiểm tra lại CHANNEL_ID trong file .env.');
        process.exit(1);
    }

    // Hàm kiểm tra và chạy thủ công ngay khi khởi động
    const now = new Date();
    const runMissedJobs = () => {
        reminders.forEach((reminder, index) => {
            channel.send(`@everyone ${reminder.message} (Chạy lại do bỏ lỡ)`)
                .then(() => logger.info(`✅ Đã gửi nhắc nhở đã bỏ lỡ: ${reminder.message}`))
                .catch((err) => logger.error(`❌ Lỗi khi gửi tin nhắn: ${err.message}`));
        });
    };

    // Chạy thủ công ngay khi khởi động
    runMissedJobs();

    // Lên lịch gửi tin nhắn
    reminders.forEach((reminder, index) => {
        schedule.scheduleJob(`reminder-${index}`, reminder.time, { tz: reminder.tz }, () => {
            logger.info(`⏰ Đang chạy lịch trình nhắc nhở ${index + 1} vào ${new Date().toString()}`);
            channel.send(`@everyone ${reminder.message}`)
                .then(() => logger.info(`✅ Đã gửi nhắc nhở: ${reminder.message}`))
                .catch((err) => logger.error(`❌ Lỗi khi gửi tin nhắn: ${err.message}`));
        });
        logger.info(`📅 Đã lên lịch nhắc nhở ${index + 1} vào ${reminder.time} (${reminder.tz})`);
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