const express = require('express');
const config = require('./config/config');

const startServer = (logger) => {
    const app = express();

    app.get('/', (req, res) => res.send('Bot đang chạy!'));

    app.listen(config.PORT, () => {
        logger.info(`✅ Server Express chạy trên port ${config.PORT}`);
    });
};

module.exports = startServer;