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

const reminders = [
    { time: '0 9 * * 1-5', message: '📝 Nhắc nhở: Bắt đầu ASAKAI thôi mọi người!' },
    { time: '0 12 * * 1-5', message: '🍽️ Nhắc nhở: Ăn trưa lúc 12 nhé!' },
    { time: '0 16 * * 1-5', message: 'Lời nhắc: Toàn nay nhớ mời mọi bữa chiều nhé' },
    { time: '45 16 * * 1-5', message: '🍽️ Nhắc nhở: Chuẩn bị hết giờ làm rồi mọi người nhớ report trước khi về nhé!' },
];

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);

    const channel = client.channels.cache.get(process.env.CHANNEL_ID);

    if (!channel) {
        console.error('❌ Không tìm thấy kênh! Kiểm tra lại CHANNEL_ID.');
        return;
    }

    reminders.forEach((reminder) => {
        schedule.scheduleJob(reminder.time, () => {
            channel.send(`@everyone ${reminder.message}`);
            console.log(`✅ Đã gửi nhắc nhở: ${reminder.message}`);
        });
    });
});
client.login(process.env.DISCORD_TOKEN);
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot đang chạy!'));

app.listen(PORT, () => {
    console.log(`✅ Server Express chạy trên port ${PORT}`);
});