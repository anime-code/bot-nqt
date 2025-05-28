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
    { time: '* * * * *', message: 'Bắt đầu ASAKAI thôi mọi người!' },  // mỗi 1 phút
    { time: '*/2 * * * *', message: 'Nhớ đừng quên daily report nhé: https://work-report.thk-hd-hn.vn/' }, // mỗi 2 phút
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