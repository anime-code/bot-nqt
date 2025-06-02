const winston = require('winston');

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

module.exports = DiscordTransport;