const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const schedule = require('node-schedule');
const winston = require('winston');
const axios = require('axios');
require('dotenv').config();

// Load user mapping from users.json
const userMapping = require('./users.json');

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
                logger.error(`❌ Lỗi khi gửi log tới Discord: ${err.message}`);
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
            thumbnail: 'https://vietour.vn/images/hinh-bat-pho-vietour01.jpg'
        },
        {
            description: '🍔 **12:00 trưa** rồi! Giờ **nghỉ trưa** nè, ai ăn burger, ai ăn cơm tấm đây? 😎 Let’s go! 🎈',
            thumbnail: 'https://media.istockphoto.com/id/1412706588/vi/anh/hamburger-tr%C3%AAn-th%E1%BB%9Bt-th%E1%BB%A7-c%C3%B4ng-n%E1%BB%81n-t%C3%A2m-tr%E1%BA%A1ng-t%E1Ỗ1.jpg?s=612x612&w=0&k=20&c=xSxOsMObANKGI_AkLj0x29I1UqM84QYMbNeCJ4Sg8nY='
        },
        {
            description: '🍣 **Nghỉ trưa** thôi nào! Sushi, bánh xèo hay trà sữa, chọn gì đây? 😋 **12:00** nha mọi người! 🚴‍♂️',
            thumbnail: 'https://media.istockphoto.com/id/1555947107/vi/anh/set-sushi-v%C3%A0-maki.jpg?s=612x612&w=0&k=20&c=r_heT_qgK5SYpLrFd5M-U9v81w5kcj5zok05AZl5_rw='
        }
    ];
    return lunchMessages[Math.floor(Math.random() * lunchMessages.length)];
};

// Hàm fetchNonSubmitters để lấy danh sách người chưa nộp báo cáo
const fetchNonSubmitters = async (date, teamIds) => {
    const nonSubmitters = [];
    const errors = [];
    const cookie = `en; fuel_csrf_token=${process.env.FUEL_CSRF_TOKEN}; fuelfid=${process.env.FUELFID}; rmcookie=${process.env.RMCOOKIE}`;

    for (const teamId of teamIds) {
        let start = 0;
        const length = 20;
        let totalRecords = 0;

        do {
            try {
                const queryParams = {
                    draw: 1,
                    start: start,
                    length: length,
                    team_id: teamId,
                    date: date,
                };

                const response = await axios.get(process.env.WORK_REPORT_URL, {
                    params: queryParams,
                    headers: {
                        'x-requested-with': 'XMLHttpRequest',
                        'Cookie': cookie,
                    },
                });

                const reports = response.data.data || [];
                totalRecords = response.data.recordsTotal || 0;
                const teamNonSubmitters = reports
                    .filter(report => !report.reported)
                    .map(report => ({ ...report, team_id: teamId }));
                nonSubmitters.push(...teamNonSubmitters);
                logger.info(`✅ Fetched ${reports.length} reports for team ${teamId} (start: ${start}) on ${date}`);
                start += length;
            } catch (err) {
                const errorMsg = `❌ Error fetching reports for team ${teamId} (start: ${start}) on ${date}: ${err.message}`;
                errors.push(errorMsg);
                logger.error(errorMsg);
                if (err.response?.status === 401 || err.response?.status === 403) {
                    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
                    if (logChannel) {
                        await retrySendMessage(logChannel, `⚠ Cookie hoặc token hết hạn cho team ${teamId}! Vui lòng cập nhật FUELFID và RMCOOKIE.`);
                    }
                }
                break;
            }
        } while (start < totalRecords);
    }

    return { nonSubmitters, errors };
};

// Mảng reminders với Embeds
const reminders = [
    {
        time: '0 59 8 * * 1-5',
        embed: () => new EmbedBuilder()
            .setTitle('🌞 **ASAKAI TIME!**')
            .setDescription('🚀 **Sáng rực rỡ rồi!** Mọi người sẵn sàng họp ASAKAI chưa? 💪 **8:59 sáng** nè, vào thôi nào! 🎉')
            .setColor('#FFD700')
            .addFields(
                { name: '⏰ Thời gian', value: '8:59 AM', inline: true },
                { name: '📍 Kênh họp', value: 'Kiểm tra Zoom/Discord nha!', inline: true }
            )
            .setThumbnail('https://st.quantrimang.com/photos/image/2020/12/25/Hinh-chuc-buoi-sang-4.jpg')
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
                .setColor('#00FF7F')
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
            .setDescription('⏰ **16:45 chiều** rồi nè! Đừng quên **báo cáo ngày** nha mọi người! 📊 Nhanh tay vào link báo cáo nào! 💪')
            .setColor('#FF4500')
            .addFields(
                { name: '⏰ Thời gian', value: '4:45 PM', inline: true },
                { name: '🔗 Link báo cáo', value: '[Work Report](https://work-report.thk-hd-hn.vn/)', inline: true }
            )
            .setThumbnail('https://png.pngtree.com/png-clipart/20190614/original/pngtree-report-writing-line-filled-icon-png-image_3789245.jpg')
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

// client.once('ready')
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    logger.info(`⏰ Thời gian hiện tại khi khởi động: ${new Date().toString()}`);

    const channel = client.channels.cache.get(process.env.CHANNEL_ID) || await client.channels.fetch(process.env.CHANNEL_ID);
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID) || await client.channels.fetch(process.env.LOG_CHANNEL_ID);

    if (!channel) {
        logger.error('❌ Không tìm thấy kênh chính! Kiểm tra lại CHANNEL_ID.');
        return;
    }

    if (!logChannel) {
        logger.error('❌ Không tìm thấy kênh log! Kiểm tra lại LOG_CHANNEL_ID.');
    } else {
        logger.transports.find(transport => transport instanceof DiscordTransport).logChannel = logChannel;
    }

    // Set time zone for scheduling
    // schedule.setDefaultTimeZone('Asia/Ho_Chi_Minh');

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

    // Scheduled task for non-submitters report at 5:00 PM
    schedule.scheduleJob('non-submitter-report', '0 0 17 * * 1-5', async () => {
        logger.info(`⏰ Đang chạy báo cáo non-submitters vào ${new Date().toString()}`);
        try {
            const today = new Date().toISOString().split('T')[0];
            const teamIds = process.env.TEAM_IDS.split(',').map(id => id.trim());
            const { nonSubmitters, errors } = await fetchNonSubmitters(today, teamIds);

            if (errors.length > 0) {
                logger.warn(`⚠ Có lỗi khi lấy danh sách non-submitters: ${errors.join('; ')}`);
                if (logChannel) {
                    await retrySendMessage(logChannel, `⚠ Có lỗi khi lấy danh sách non-submitters: ${errors.join('; ')}`);
                }
            }

            logger.info(`📋 Tìm thấy ${nonSubmitters.length} người chưa nộp báo cáo`);
            if (nonSubmitters.length === 0 && errors.length <= 0) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ **[BÁO CÁO 5H] Tình Hình Báo Cáo**')
                    .setDescription('🎉 Tất cả đã nộp báo cáo hôm nay! Giữ vững phong độ nha mọi người! 💪')
                    .setColor('#00FF7F') // Green to indicate success
                    .addFields(
                        { name: '⏰ Thời gian', value: '5:00 PM', inline: true },
                        { name: '📅 Ngày', value: today, inline: true }
                    )
                    .setThumbnail('https://png.pngtree.com/png-clipart/20190614/original/pngtree-report-writing-line-filled-icon-png-image_3789245.jpg')
                    .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();
                await retrySendMessage(channel, embed);
                if (logChannel) {
                    await retrySendMessage(logChannel, '✅ [BÁO CÁO 5H] Tất cả đã nộp báo cáo!');
                }
                return;
            }

            const taggedUsers = new Set();
            const nonSubmitterDetails = [];
            for (const user of nonSubmitters) {
                const discordId = userMapping[user.id];
                if (!discordId) {
                    logger.warn(`❌ Không tìm thấy Discord ID cho user ID ${user.id} (${user.fullname})`);
                    if (logChannel) {
                        await retrySendMessage(logChannel, `⚠ Thiếu Discord ID cho ${user.fullname} (ID: ${user.id})`);
                    }
                    continue;
                }
                if (taggedUsers.has(discordId)) {
                    continue;
                }
                taggedUsers.add(discordId);
                nonSubmitterDetails.push({ discordId, fullname: user.fullname, team_id: user.team_id });
            }

            if (taggedUsers.size > 0) {
                const mentions = nonSubmitterDetails.map(user => `<@${user.discordId}>`).join(', ');
                const details = nonSubmitterDetails
                    .map(user => `${user.fullname} (Team ${user.team_id})`)
                    .join(', ');
                const embed = new EmbedBuilder()
                    .setTitle('⏰ **[BÁO CÁO 5H] Nhắc Nhở Nộp Báo Cáo!**')
                    .setDescription(`${mentions}\n📋 Các bạn **chưa nộp báo cáo hôm nay (${today})**: ${details}\nHãy nhanh tay nộp báo cáo nhé! 🚀`)
                    .setColor('#FF4500') // Orange, matching daily report
                    .addFields(
                        { name: '⏰ Thời gian', value: '5:00 PM', inline: true },
                        { name: '🔗 Link báo cáo', value: '[Work Report](https://work-report.thk-hd-hn.vn/)', inline: true }
                    )
                    .setThumbnail('https://png.pngtree.com/png-clipart/20190614/original/pngtree-report-writing-line-filled-icon-png-image_3789245.jpg')
                    .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();
                await retrySendMessage(channel, embed);
                logger.info(`✅ Đã tag ${taggedUsers.size} người chưa nộp báo cáo trong kênh chính`);
            }

            if (logChannel) {
                const summary = taggedUsers.size > 0
                    ? `📋 [BÁO CÁO 5H] Đã tag ${taggedUsers.size} người chưa nộp báo cáo: ${nonSubmitterDetails.map(user => user.name).join(', ')}`
                    : '⚠ [BÁO CÁO 5H] Không tìm thấy Discord ID để tag non-submitters';
                await retrySendMessage(logChannel, summary);
            }
        } catch (err) {
            logger.error(`❌ Lỗi khi chạy báo cáo non-submitters: ${err.message}`);
            if (logChannel) {
                await retrySendMessage(logChannel, '⚠ [BÁO CÁO 5H] Không thể chạy báo cáo non-submitters. Vui lòng kiểm tra log!');
            }
        }
    });
    logger.info('📅 Đã lên lịch báo cáo non-submitters vào 17:00 thứ 2–6');

    // Đăng ký lệnh slash
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Kiểm tra trạng thái của bot'),
            // new SlashCommandBuilder()
            //     .setName('non-submitters')
            //     .setDescription('Kiểm tra và tag người chưa nộp báo cáo')
            //     .addStringOption(option =>
            //         option.setName('date')
            //             .setDescription('Ngày (YYYY-MM-DD)')
            //             .setRequired(false)
            //     )
            //     .setDefaultMemberPermissions('ManageGuild'),
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

    if (interaction.commandName === 'non-submitters') {
        const channel = client.channels.cache.get(process.env.CHANNEL_ID) || await client.channels.fetch(process.env.CHANNEL_ID);
        const date = interaction.options.getString('date') || new Date().toISOString().split('T')[0];
        let summary = '📋 Danh sách người chưa nộp báo cáo:';
        try {
            const teamIds = process.env.TEAM_IDS.split(',').map(id => id.trim());
            const { nonSubmitters, errors } = await fetchNonSubmitters(date, teamIds);
            if (errors.length > 0) {
                summary += `\n⚠ Có lỗi: ${errors.join('; ')}`;
            }
            if (nonSubmitters.length === 0) {
                summary += '\n✅ Tất cả đã nộp báo cáo!';
            } else {
                const taggedUsers = new Set();
                const nonSubmitterDetails = [];
                for (const user of nonSubmitters) {
                    const discordId = userMapping[user.id];
                    if (!discordId || taggedUsers.has(discordId)) continue;
                    taggedUsers.add(discordId);
                    nonSubmitterDetails.push({ discordId, fullname: user.fullname, team_id: user.team_id });
                }
                if (nonSubmitterDetails.length > 0) {
                    const mentions = nonSubmitterDetails.map(user => `<@${user.discordId}>`).join(', ');
                    const details = nonSubmitterDetails
                        .map(user => `${user.fullname} (Team ${user.team_id})`)
                        .join(', ');
                    summary += `\n${mentions}\n${details}`;
                    await retrySendMessage(channel, `⏰ **Nhắc nhở từ admin!** ${mentions}\nCác bạn chưa nộp báo cáo ngày ${date}: ${details}\nVui lòng nộp tại: https://work-report.thk-hd-hn.vn/`);
                } else {
                    summary += '\n⚠ Không tìm thấy Discord ID để tag!';
                }
            }
        } catch (err) {
            summary = '⚠ Không thể lấy danh sách non-submitters!';
        }
        await interaction.reply({ content: summary, ephemeral: true });
        logger.info(`📡 Lệnh /non-submitters được gọi bởi ${interaction.user.tag} cho ngày ${date}`);
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
        if (!process.env.WORK_REPORT_URL || !process.env.TEAM_IDS || !process.env.FUEL_CSRF_TOKEN || !process.env.FUELFID || !process.env.RMCOOKIE) {
            logger.error('❌ Thiếu thông tin API trong file .env! (WORK_REPORT_URL, TEAM_IDS, FUEL_CSRF_TOKEN, FUELFID, RMCOOKIE)');
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
    }).catch(err => {
        logger.error(`❌ Lỗi khi hủy lịch trình: ${err.message}`);
        client.destroy();
        process.exit(1);
    });
});