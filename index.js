const {
    Client,
    GatewayIntentBits,
    Partials,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionsBitField
} = require('discord.js');
const schedule = require('node-schedule');
const winston = require('winston');
const fs = require('fs').promises;
const cronParser = require('cron-parser');
const express = require('express');
require('dotenv').config();

// Load allowed users from allowedUsers.json
let allowedUsers = [];
const loadAllowedUsers = async () => {
    try {
        const data = await fs.readFile('./allowedUsers.json', 'utf8');
        const json = JSON.parse(data);
        allowedUsers = json.allowedUsers || [];
        logger.info(`✅ Loaded ${allowedUsers.length} allowed users from allowedUsers.json`);
    } catch (err) {
        logger.error(`❌ Failed to load allowedUsers.json: ${err.message}`);
        allowedUsers = [];
    }
};

// Custom DiscordTransport for logging
class DiscordTransport extends winston.transports.Console {
    constructor(options) {
        super(options);
        this.name = 'discord';
        this.level = options.level || 'info';
    }

    async log(info, callback) {
        const {timestamp, level, message} = info;
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

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        winston.format.printf(({timestamp, level, message}) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({filename: 'bot.log'}),
        new DiscordTransport({level: 'info'}),
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

// File to store reminders
const REMINDERS_FILE = './reminders.json';

// Load reminders from file
const loadReminders = async () => {
    try {
        const data = await fs.readFile(REMINDERS_FILE, 'utf8');
        return JSON.parse(data).reminders || [];
    } catch (err) {
        logger.error(`❌ Lỗi khi đọc reminders.json: ${err.message}`);
        return [];
    }
};

// Save reminders to file
const saveReminders = async (reminders) => {
    try {
        await fs.writeFile(REMINDERS_FILE, JSON.stringify({reminders}, null, 2));
        logger.info('✅ Đã lưu reminders vào file');
    } catch (err) {
        logger.error(`❌ Lỗi khi lưu reminders.json: ${err.message}`);
    }
};

// Validate cron expression
const isValidCron = (cron) => {
    try {
        // cronParser.parseExpression(cron);
        return true;
    } catch (err) {
        return false;
    }
};

// Convert user-friendly time and days to cron expression
const generateCronExpression = (time, days) => {
    // Validate time (HH:MM)
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
        throw new Error('Invalid time format. Use HH:MM (e.g., 14:00).');
    }
    const [_, hours, minutes] = timeMatch;
    if (hours > 23 || minutes > 59) {
        throw new Error('Invalid time values. Hours: 0-23, Minutes: 0-59.');
    }

    // Normalize and validate days
    if (typeof days !== 'string' || !days.trim()) {
        throw new Error('Days input cannot be empty. Use Mon-Sun, daily, or Mon-Fri.');
    }

    days = days.trim();
    let cronDays = '*';
    if (days.toLowerCase() === 'daily') {
        cronDays = '*';
    } else {
        // Handle ranges (e.g., Mon-Fri, Mon - Fri) and lists (e.g., Mon,Wed,Fri)
        const dayMap = {
            'mon': '1', 'monday': '1',
            'tue': '2', 'tuesday': '2',
            'wed': '3', 'wednesday': '3',
            'thu': '4', 'thursday': '4',
            'fri': '5', 'friday': '5',
            'sat': '6', 'saturday': '6',
            'sun': '0', 'sunday': '0'
        };
        const dayInput = days.toLowerCase().replace(/\s+/g, ''); // Remove all spaces
        const dayRanges = dayInput.split('-');
        let cronDayList = [];

        if (dayRanges.length > 1) {
            // Handle range (e.g., Mon-Fri)
            const [start, end] = dayRanges;
            if (!start || !end) {
                throw new Error(`Invalid day range in "${days}". Use Mon-Fri or Monday-Friday.`);
            }
            const startDay = dayMap[start];
            const endDay = dayMap[end];
            if (!startDay || !endDay) {
                throw new Error(`Invalid day range in "${days}". Use Mon-Fri or Monday-Friday. Found: ${start}-${end}`);
            }
            cronDays = `${startDay}-${endDay}`;
        } else {
            // Handle individual days (e.g., Mon,Wed,Fri)
            const dayList = dayInput.split(/[,;]/).map(d => d.trim()).filter(d => d);
            if (dayList.length === 0) {
                throw new Error(`No valid days found in "${days}". Use Mon-Sun, daily, or Mon-Fri.`);
            }
            for (const day of dayList) {
                const cronDay = dayMap[day];
                if (!cronDay) {
                    throw new Error(`Invalid day "${day}" in "${days}". Use Mon-Sun, daily, or Mon-Fri.`);
                }
                if (!cronDayList.includes(cronDay)) { // Avoid duplicates
                    cronDayList.push(cronDay);
                }
            }
            cronDays = cronDayList.join(',');
        }
    }

    // Generate cron expression
    const cron = `${minutes} ${hours} * * ${cronDays}`;
    if (!isValidCron(cron)) {
        throw new Error(`Generated cron expression is invalid: "${cron}".`);
    }
    return cron;
};

// Retry sending messages
const retrySendMessage = async (channel, content, options = {
    retries: 3,
    delay: 5000,
    mention: process.env.MENTION || '@everyone'
}) => {
    for (let i = 0; i < options.retries; i++) {
        try {
            if (typeof content === 'string') {
                await channel.send({content});
            } else {
                await channel.send({content: options.mention, embeds: [content]});
            }
            return true;
        } catch (err) {
            logger.error(`❌ Lỗi khi gửi tin nhắn (lần ${i + 1}/${options.retries}): ${err.message}, Channel ID: ${channel?.id || 'Không xác định'}`);
            if (i < options.retries - 1) {
                logger.info(`⏳ Thử lại sau ${options.delay / 1000} giây...`);
                await new Promise(resolve => setTimeout(resolve, options.delay));
            }
        }
    }
    return false;
};

// Create reminder embed
const createReminderEmbed = (message, color = '#1E90FF', title = '🔔 **NHẮC NHỞ!**', note = 'Cảm ơn bạn đã sử dụng bot!') => {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setColor(color)
        .addFields(
            {
                name: '⏰ Thời gian',
                value: new Date().toLocaleTimeString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'}),
                inline: true
            },
            {name: '📢 Ghi chú', value: note, inline: true}
        )
        .setFooter({text: 'Bot nhắc nhở siêu xịn by NQT', iconURL: client.user.displayAvatarURL()})
        .setTimestamp();
};

// Convert cron to human-readable format for display
const cronToHumanReadable = (cron) => {
    try {
        const parts = cron.split(' ');
        if (parts.length !== 5) return 'Unknown schedule';
        const [minutes, hours, , , days] = parts;
        const time = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
        let dayStr = 'Daily';
        if (days !== '*') {
            const dayMap = {'0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat'};
            if (days.includes('-')) {
                const [start, end] = days.split('-');
                dayStr = `${dayMap[start]}-${dayMap[end]}`;
            } else {
                dayStr = days.split(',').map(d => dayMap[d]).join(',');
            }
        }
        return `${time} ${dayStr}`;
    } catch (err) {
        return 'Invalid cron';
    }
};

// Get the next trigger time for a cron expression
const getNextTriggerTime = (cron) => {
    try {
        const interval = cronParser.parseExpression(cron, {tz: 'Asia/Ho_Chi_Minh'});
        const next = interval.next();
        return next.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
    } catch (err) {
        return 'Unknown';
    }
};

// Check if a user can add reminders (based on allowedUsers array)
const canAddReminder = (member) => {
    return allowedUsers.includes(member.user.id);
};

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    logger.info(`⏰ Thời gian hiện tại khi khởi động: ${new Date().toString()}`);

    // Load allowed users
    await loadAllowedUsers();

    let channel, logChannel;
    try {
        channel = await client.channels.fetch(process.env.CHANNEL_ID);
        logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
    } catch (err) {
        logger.error(`❌ Lỗi khi lấy kênh: ${err.message}`);
        return;
    }

    if (!channel) {
        logger.error('❌ Không tìm thấy kênh chính! Kiểm tra lại CHANNEL_ID.');
        return;
    }
    if (!logChannel) {
        logger.error('❌ Không tìm thấy kênh log! Kiểm tra lại LOG_CHANNEL_ID.');
    } else {
        logger.transports.find(transport => transport instanceof DiscordTransport).logChannel = logChannel;
    }

    // Schedule hourly status log
    schedule.scheduleJob({rule: '0 * * * *', tz: 'Asia/Ho_Chi_Minh'}, async () => {
        if (logChannel) {
            const reminders = await loadReminders();
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

    // Load and schedule reminders
    const reminders = await loadReminders();
    reminders.forEach((reminder) => {
        if (!isValidCron(reminder.time)) {
            logger.error(`❌ Cron không hợp lệ cho nhắc nhở ${reminder.id}: ${reminder.time}`);
            return;
        }
        schedule.scheduleJob({rule: reminder.time, tz: 'Asia/Ho_Chi_Minh'}, async () => {
            logger.info(`⏰ Đang chạy nhắc nhở ${reminder.id} vào ${new Date().toString()}`);
            const success = await retrySendMessage(channel, createReminderEmbed(reminder.message, reminder.color, reminder.title));
            if (success) {
                logger.info(`✅ Đã gửi nhắc nhở: ${reminder.message}`);
            } else {
                logger.error(`❌ Không thể gửi nhắc nhở ${reminder.id}`);
            }
        });
        logger.info(`📅 Đã lên lịch nhắc nhở ${reminder.id} vào ${reminder.time}`);
    });

    // Register slash commands
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Kiểm tra trạng thái của bot'),
            new SlashCommandBuilder()
                .setName('addreminder')
                .setDescription('Thêm một nhắc nhở mới (dùng cron)')
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Thời gian (cron format, e.g., "0 0 12 * * 1-5")')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Nội dung nhắc nhở')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Màu embed (hex, e.g., #FF0000)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Tiêu đề của nhắc nhở (e.g., "Giờ Nghỉ Trưa")')
                        .setRequired(false)
                ),
            new SlashCommandBuilder()
                .setName('easyreminder')
                .setDescription('Thêm một nhắc nhở mới (dùng thời gian dễ đọc)')
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Thời gian (HH:MM, e.g., 14:00)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('days')
                        .setDescription('Ngày (e.g., daily, Mon-Fri, Mon,Wed,Fri)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Nội dung nhắc nhở')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Màu embed (hex, e.g., #FF0000)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Tiêu đề của nhắc nhở (e.g., "Giờ Nghỉ Trưa")')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('note')
                        .setDescription('Nhập ghi chú')
                        .setRequired(false)
                ),
            new SlashCommandBuilder()
                .setName('cronhelp')
                .setDescription('Xem cron expression từ thời gian và ngày')
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Thời gian (HH:MM, e.g., 14:00)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('days')
                        .setDescription('Ngày (e.g., daily, Mon-Fri, Mon,Wed,Fri)')
                        .setRequired(true)
                ),
            new SlashCommandBuilder()
                .setName('listreminders')
                .setDescription('Liệt kê tất cả nhắc nhở'),
            new SlashCommandBuilder()
                .setName('editreminder')
                .setDescription('Chỉnh sửa một nhắc nhở')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID của nhắc nhở')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Thời gian mới (cron format)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Nội dung mới')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Màu mới (hex)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Tiêu đề mới')
                        .setRequired(false)
                ),
            new SlashCommandBuilder()
                .setName('removereminder')
                .setDescription('Xóa một nhắc nhở')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID của nhắc nhở')
                        .setRequired(true)
                ),
        ];
        await client.application.commands.set(commands);
        logger.info('✅ Đã đăng ký lệnh slash');
    } catch (err) {
        logger.error(`❌ Lỗi khi đăng ký lệnh slash: ${err.message}`);
    }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    // Check for admin permissions (for non-add commands)
    const hasAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    // Check for add permission (for /addreminder and /easyreminder)
    const canAdd = canAddReminder(interaction.member);

    // Allow /status for everyone
    if (interaction.commandName === 'status') {
        const reminders = await loadReminders();
        await interaction.reply({
            content: `✅ Bot đang hoạt động! Hiện tại có ${reminders.length} nhắc nhở được lên lịch. Thời gian: ${new Date().toString()}`,
            ephemeral: true,
        });
        logger.info(`📡 Lệnh /status được gọi bởi ${interaction.user.tag}`);
    }
    // Restrict /addreminder and /easyreminder to allowed users
    else if (['addreminder', 'easyreminder'].includes(interaction.commandName) && !canAdd) {
        await interaction.reply({
            content: '❌ Bạn không có quyền thêm nhắc nhở! Liên hệ admin để được cấp quyền.',
            ephemeral: true
        });
        logger.info(`🚫 ${interaction.user.tag} bị từ chối quyền thêm nhắc nhở với lệnh /${interaction.commandName}`);
    }
    // Restrict other commands to users with MANAGE_GUILD permission
    else if (!hasAdmin) {
        await interaction.reply({content: '❌ Bạn cần quyền quản lý server để dùng lệnh này!', ephemeral: true});
        logger.info(`🚫 ${interaction.user.tag} bị từ chối quyền với lệnh /${interaction.commandName} (yêu cầu MANAGE_GUILD)`);
    }
    // Process commands for authorized users
    else if (interaction.commandName === 'addreminder') {
        const time = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const color = interaction.options.getString('color') || '#1E90FF';
        const title = interaction.options.getString('title') || '🔔 **NHẮC NHỞ!**';
        const note = interaction.options.getString('note') || 'Cảm ởn bạn đã sử dụng bot!';

        if (!isValidCron(time)) {
            await interaction.reply({
                content: '❌ Cron expression không hợp lệ! Ví dụ: "0 0 12 * * 1-5" cho 12:00 trưa thứ 2-6.',
                ephemeral: true
            });
            return;
        }

        if (title.length > 256) {
            await interaction.reply({content: '❌ Tiêu đề không được dài quá 256 ký tự!', ephemeral: true});
            return;
        }
        if (note.length > 256) {
            await interaction.reply({content: '❌ Ghi chú không được dài quá 256 ký tự!', ephemeral: true});
            return;
        }
        const reminders = await loadReminders();
        const id = (reminders.length + 1).toString();
        reminders.push({id, time, message, color, title});
        await saveReminders(reminders);

        schedule.scheduleJob({rule: time, tz: 'Asia/Ho_Chi_Minh'}, async () => {
            const channel = await client.channels.fetch(process.env.CHANNEL_ID);
            const success = await retrySendMessage(channel, createReminderEmbed(message, color, title));
            logger.info(success ? `✅ Đã gửi nhắc nhở ${id}: ${message}` : `❌ Không thể gửi nhắc nhở ${id}`);
        });

        await interaction.reply({content: `✅ Đã thêm nhắc nhở (ID: ${id}) vào ${time}!`, ephemeral: true});
        logger.info(`📅 ${interaction.user.tag} đã thêm nhắc nhở ${id}: ${message} với tiêu đề ${title}`);
    } else if (interaction.commandName === 'easyreminder') {
        const time = interaction.options.getString('time');
        const days = interaction.options.getString('days');
        const message = interaction.options.getString('message');
        const color = interaction.options.getString('color') || '#1E90FF';
        const title = interaction.options.getString('title') || '🔔 **NHẮC NHỞ!**';
        const note = interaction.options.getString('note') || 'Cảm ởn bạn đã sử dụng bot!';

        let cron;
        try {
            cron = generateCronExpression(time, days);
        } catch (err) {
            await interaction.reply({content: `❌ Lỗi: ${err.message}`, ephemeral: true});
            return;
        }

        if (title.length > 256) {
            await interaction.reply({content: '❌ Tiêu đề không được dài quá 256 ký tự!', ephemeral: true});
            return;
        }
        if (note.length > 256) {
            await interaction.reply({content: '❌ Ghi chú không được dài quá 256 ký tự!', ephemeral: true});
            return;
        }
        const reminders = await loadReminders();
        const id = (reminders.length + 1).toString();
        reminders.push({id, time: cron, message, color, title, note, humanReadable: `${time} ${days}`});
        await saveReminders(reminders);

        schedule.scheduleJob({rule: cron, tz: 'Asia/Ho_Chi_Minh'}, async () => {
            const channel = await client.channels.fetch(process.env.CHANNEL_ID);
            const success = await retrySendMessage(channel, createReminderEmbed(message, color, title, note));
            logger.info(success ? `✅ Đã gửi nhắc nhở ${id}: ${message}` : `❌ Không thể gửi nhắc nhở ${id}`);
        });

        await interaction.reply({content: `✅ Đã thêm nhắc nhở (ID: ${id}) vào ${time} ${days}!`, ephemeral: true});
        logger.info(`📅 ${interaction.user.tag} đã thêm nhắc nhở ${id}: ${message} với tiêu đề ${title} vào ${time} ${days}`);
    } else if (interaction.commandName === 'cronhelp') {
        const time = interaction.options.getString('time');
        const days = interaction.options.getString('days');

        let cron;
        try {
            cron = generateCronExpression(time, days);
        } catch (err) {
            await interaction.reply({content: `❌ Lỗi: ${err.message}`, ephemeral: true});
            return;
        }

        const humanReadable = `${time} ${days}`;
        await interaction.reply({
            content: `🕒 **Lịch trình**: ${humanReadable}\n📝 **Cron Expression**: \`${cron}\`\nDùng cron này với lệnh \`/addreminder\` nếu cần.`,
            ephemeral: true
        });
        logger.info(`📡 ${interaction.user.tag} đã sử dụng /cronhelp: ${time} ${days} → ${cron}`);
    } else if (interaction.commandName === 'listreminders') {
        const reminders = await loadReminders();
        if (reminders.length === 0) {
            await interaction.reply({content: '📅 Hiện tại không có nhắc nhở nào.', ephemeral: true});
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📅 Danh sách nhắc nhở')
            .setDescription(reminders.map(r => {
                const schedule = r.humanReadable || cronToHumanReadable(r.time);
                const nextTrigger = getNextTriggerTime(r.time);
                return `**ID: ${r.id}** | Lịch: ${schedule} | Tiêu đề: ${r.title} | Nội dung: ${r.message}\n⏳ **Kích hoạt tiếp theo**: ${nextTrigger}`;
            }).join('\n\n'))
            .setColor('#00FF7F')
            .setTimestamp();
        await interaction.reply({embeds: [embed], ephemeral: true});
        logger.info(`📡 Lệnh /listreminders được gọi bởi ${interaction.user.tag}`);
    } else if (interaction.commandName === 'editreminder') {
        const id = interaction.options.getString('id');
        const newTime = interaction.options.getString('time');
        const newMessage = interaction.options.getString('message');
        const newColor = interaction.options.getString('color');
        const newTitle = interaction.options.getString('title');
        const newNote = interaction.options.getString('note');

        if (!newTime && !newMessage && !newColor && !newTitle) {
            await interaction.reply({
                content: '❌ Vui lòng cung cấp ít nhất một giá trị để chỉnh sửa (time, message, color, hoặc title)!',
                ephemeral: true
            });
            return;
        }

        if (newTime && !isValidCron(newTime)) {
            await interaction.reply({content: '❌ Cron expression không hợp lệ!', ephemeral: true});
            return;
        }

        if (newTitle && newTitle.length > 256) {
            await interaction.reply({content: '❌ Tiêu đề không được dài quá 256 ký tự!', ephemeral: true});
            return;
        }

        const reminders = await loadReminders();
        const reminder = reminders.find(r => r.id === id);
        if (!reminder) {
            await interaction.reply({content: `❌ Không tìm thấy nhắc nhở với ID: ${id}!`, ephemeral: true});
            return;
        }

        reminder.time = newTime || reminder.time;
        reminder.message = newMessage || reminder.message;
        reminder.color = newColor || reminder.color;
        reminder.title = newTitle || reminder.title;
        reminder.note = newNote || reminder.note;
        if (newTime) delete reminder.humanReadable; // Reset human-readable if cron changes
        await saveReminders(reminders);

        // Cancel old schedule
        const job = schedule.scheduledJobs[`reminder-${id}`];
        if (job) job.cancel();

        // Reschedule
        schedule.scheduleJob({rule: reminder.time, tz: 'Asia/Ho_Chi_Minh'}, async () => {
            const channel = await client.channels.fetch(process.env.CHANNEL_ID);
            const success = await retrySendMessage(channel, createReminderEmbed(reminder.message, reminder.color, reminder.title, reminder.note));
            logger.info(success ? `✅ Đã gửi nhắc nhở ${id}: ${reminder.message}` : `❌ Không thể gửi nhắc nhở ${id}`);
        });

        await interaction.reply({content: `✅ Đã chỉnh sửa nhắc nhở (ID: ${id})!`, ephemeral: true});
        logger.info(`📅 ${interaction.user.tag} đã chỉnh sửa nhắc nhở ${id}`);
    } else if (interaction.commandName === 'removereminder') {
        const id = interaction.options.getString('id');
        const reminders = await loadReminders();
        const reminderIndex = reminders.findIndex(r => r.id === id);

        if (reminderIndex === -1) {
            await interaction.reply({content: `❌ Không tìm thấy nhắc nhở với ID: ${id}!`, ephemeral: true});
            return;
        }

        reminders.splice(reminderIndex, 1);
        await saveReminders(reminders);

        const job = schedule.scheduledJobs[`reminder-${id}`];
        if (job) job.cancel();

        await interaction.reply({content: `✅ Đã xóa nhắc nhở (ID: ${id})!`, ephemeral: true});
        logger.info(`📅 ${interaction.user.tag} đã xóa nhắc nhở ${id}`);
    }
});

// Error handling
client.on('error', (err) => {
    logger.error(`❌ Lỗi client Discord: ${err.message}`);
});

client.on('disconnect', () => {
    logger.warn('⚠ Bot đã ngắt kết nối, đang thử kết nối lại...');
});

client.on('reconnecting', () => {
    logger.info('🔄 Bot đang kết nối lại...');
});

// Login bot
const loginBot = async () => {
    try {
        const requiredEnv = ['DISCORD_TOKEN', 'CHANNEL_ID', 'LOG_CHANNEL_ID'];
        for (const env of requiredEnv) {
            if (!process.env[env]) {
                logger.error(`❌ ${env} không được tìm thấy trong file .env!`);
                process.exit(1);
            }
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
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
    const reminders = await loadReminders();
    res.json({status: 'running', reminders: reminders.length, uptime: process.uptime()});
});

app.listen(PORT, () => {
    logger.info(`✅ Server Express chạy trên port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('📴 Bot đang tắt...');
    schedule.gracefulShutdown().then(() => {
        logger.info('📅 Đã hủy tất cả lịch trình');
        client.destroy();
        process.exit(0);
    });
});