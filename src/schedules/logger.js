const schedule = require('node-schedule');
const retrySendMessage = require('../utils/retrySend');

const scheduleLogger = (logger, logChannel, reminders) => {
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
};

module.exports = scheduleLogger;