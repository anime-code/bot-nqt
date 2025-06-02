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
            console.error(`❌ Lỗi khi gửi tin nhắn (lần ${i + 1}/${retries}): ${err.message}, Channel ID: ${channel?.id || 'Không xác định'}`);
            if (i < retries - 1) {
                console.info(`⏳ Thử lại sau ${delay / 1000} giây...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return false;
};

module.exports = retrySendMessage;