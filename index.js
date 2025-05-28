// bot.js

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const schedule = require('node-schedule');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

// Danh sách nhắc nhở
const reminders = [
    { time: '05 17 * * 1-5', message: 'Bắt đầu ASAKAI thôi mọi người!' },  // 16:30 thứ 2-6
    { time: '00 17 * * 1-5', message: 'Nhớ đừng quên daily report nhé: https://work-report.thk-hd-hn.vn/' }, // 16:45 thứ 2-6
];

// Khi bot đã sẵn sàng
client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);

    // Lên lịch gửi tin nhắn
    reminders.forEach((reminder) => {
        schedule.scheduleJob(reminder.time, () => {
            const channel = client.channels.cache.get(process.env.CHANNEL_ID);
            if (!channel) {
                console.error('❌ Không tìm thấy kênh! Kiểm tra lại CHANNEL_ID.');
                return;
            }
            channel.send(`@everyone ${reminder.message}`)
                .then(() => console.log(`✅ Đã gửi nhắc nhở: ${reminder.message}`))
                .catch((err) => console.error(`❌ Lỗi khi gửi tin nhắn: ${err}`));
        });
    });
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN)
    .catch((err) => console.error('❌ Lỗi đăng nhập bot:', err));

// Express server để giữ bot hoạt động (optional)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot đang chạy!'));

app.listen(PORT, () => {
    console.log(`✅ Server Express chạy trên port ${PORT}`);
});
