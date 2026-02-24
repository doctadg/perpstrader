"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var winston_1 = require("winston");
var path_1 = require("path");
var logDir = path_1.default.join(__dirname, '../../logs');
var logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'perps-trader' },
    transports: [
        // File transports removed - they were filling the disk (50+ GB)
        // Traces are stored in SQLite database instead
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ],
});
exports.default = logger;
