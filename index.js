const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

// Hàm tạo Embed ngẫu nhiên cho thông báo nghỉ trưa
const getRandomLunchEmbed = () => {
    const lunchMessages = [
        {
            description: '🍜 **Tèn ten!** Đến giờ **nghỉ trưa** rồi nè! 😋 Đi ăn phở hay bún gì ngon đi, 12:00 trưa rùi! 🥳',
            thumbnail: 'https://i.imgur.com/5Z9e7yK.png' // Hình bát phở
        },
        {
            description: '🍔 **12:00 trưa** rồi! Giờ **nghỉ trưa** nè, ai ăn burger, ai ăn cơm tấm đây? 😎 Let’s go! 🎈',
            thumbnail: 'https://i.imgur.com/8kXjW3n.png' // Hình burger
        },
        {
            description: '🍣 **Nghỉ trưa** thôi nào! Sushi, bánh xèo hay trà sữa, chọn gì đây? 😋 **12:00** nha mọi người! 🚴‍♂️',
            thumbnail: 'https://i.imgur.com/4fY2m9R.png' // Hình sushi
        }
    ];
    return lunchMessages[Math.floor(Math.random() * lunchMessages.length)];
};

// Mảng reminders với Embeds
const reminders = [
    {
        time: '0 59 8 * * 1-5',
        embed: () => new EmbedBuilder()
            .setTitle('🌞 **ASAKAI TIME!**')
            .setDescription('🚀 **Sáng rực rỡ rồi!** Mọi người sẵn sàng họp ASAKAI chưa? 💪 **8:59 sáng** nè, vào thôi nào! 🎉')
            .setColor('#FFD700') // Màu vàng sáng
            .addFields(
                { name: '⏰ Thời gian', value: '8:59 AM', inline: true },
                { name: '📍 Kênh họp', value: 'Kiểm tra Zoom/Discord nha!', inline: true }
            )
            .setThumbnail('https://i.imgur.com/3xY9Z2k.png') // Hình mặt trời
            .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT', iconURL: client.user.displayAvatarURL() })
            .setTimestamp()
    },
    {
        time: '0 55 11 * * 1-5',
        embed: () => {
            const { description, thumbnail } = getRandomLunchEmbed();
            return new EmbedBuilder()
                .setTitle('🍴 **GIỜ NGHỈ TRƯA!**')
                .setDescription(description)
                .setColor('#00FF7F') // Màu xanh lá tươi
                .addFields(
                    { name: '⏰ Thời gian', value: '11:55 PM', inline: true },
                    { name: '🍽 Gợi ý', value: 'Ăn gì ngon thì share nha!', inline: true }
                )
                .setThumbnail(thumbnail)
                .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();
        }
    },
    {
        time: '0 45 16 * * 1-5',
        embed: () => new EmbedBuilder()
            .setTitle('📝 **HẾU HẾU! DAILY REPORT TIME!**')
            .setDescription('⏰ **16:55 chiều** rồi nè! Đừng quên **báo cáo ngày** nha mọi người! 📊 Nhanh tay vào link báo cáo nào! 💪')
            .setColor('#FF4500') // Màu cam nổi bật
            .addFields(
                { name: '⏰ Thời gian', value: '4:55 PM', inline: true },
                { name: '🔗 Link báo cáo', value: '[Work Report](https://work-report.thk-hd-hn.vn/)', inline: true }
            )
            .setThumbnail('https://i.imgur.com/7pX8q9L.png') // Hình checklist
            .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT', iconURL: client.user.displayAvatarURL() })
            .setTimestamp()
    }
];

// Cập nhật retrySendMessage để hỗ trợ cả chuỗi và embeds
const retrySendMessage = async (channel, content, retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            if (typeof content === 'string') {
                await channel.send({ content });
            } else {
                await channel.send({ content: '@everyone', embeds: [content] });
            }
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

    // Lên lịch gửi log mỗi 1 giờ
    schedule.scheduleJob('log-every-hour', '0 * * * *', async () => {
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
    logger.info('📅 Đã lên lịch log trạng thái mỗi 1 giờ');

    // Lên lịch các nhắc nhở
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