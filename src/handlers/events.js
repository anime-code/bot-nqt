const handleEvents = (client, logger) => {
    client.on('error', (err) => {
        logger.error(`❌ Lỗi client Discord: ${err.message}`);
    });

    client.on('disconnect', () => {
        logger.warn('⚠ Bot đã ngắt kết nối, đang thử kết nối lại...');
    });

    client.on('reconnecting', () => {
        logger.info('🔄 Bot đang kết nối lại...');
    });
};

module.exports = handleEvents;