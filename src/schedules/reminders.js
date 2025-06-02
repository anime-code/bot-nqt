const { EmbedBuilder } = require('discord.js');

const getRandomLunchEmbed = () => {
    const lunchMessages = [
        {
            description: '🍜 **Tèn ten!** Đến giờ **nghỉ trưa** rồi nè! 😋 Đi ăn phở hay bún gì ngon đi, 12:00 trưa rùi! 🥳',
            thumbnail: 'https://vietour.vn/images/hinh-bat-pho-vietour01.jpg'
        },
        {
            description: '🍔 **12:00 trưa** rồi! Giờ **nghỉ trưa** nè, ai ăn burger, ai ăn cơm tấm đây? 😎 Let’s go! 🎈',
            thumbnail: 'https://media.istockphoto.com/id/1412706588/vi/anh/hamburger-trên-thịt-thủ-công-nền-tâm-trạng-tối.jpg?s=612x612&w=0&k=20&c=xSxOsMObANKGI_AkLj0x29I1UqM84QYMbNeCJ4Sg8nY='
        },
        {
            description: '🍣 **Nghỉ trưa** thôi nào! Sushi, bánh xèo hay trà sữa, chọn gì đây? 😋 **12:00** nha mọi người! 🚴‍♂️',
            thumbnail: 'https://media.istockphoto.com/id/1555947107/vi/anh/set-sushi-và-maki.jpg?s=612x612&w=0&k=20&c=r_heT_qgK5SYpLrFd5M-U9v81w5kcj5zok05AZl5_rw='
        }
    ];
    return lunchMessages[Math.floor(Math.random() * lunchMessages.length)];
};

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
            .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT' })
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
                    { name: '⏰ Thời gian', value: '11:55 AM', inline: true },
                    { name: '🍽 Gợi ý', value: 'Ăn gì ngon thì share nha!', inline: true }
                )
                .setThumbnail(thumbnail)
                .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT' })
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
            .setFooter({ text: 'Bot nhắc nhở siêu xịn by NQT' })
            .setTimestamp()
    }
];

module.exports = reminders;