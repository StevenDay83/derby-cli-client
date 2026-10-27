const Logger = {
    WriteLog: (message, loglevel = 1) => {
        if (process.env.LogLevel >= loglevel){
            console.error(message);
        }
    },
    ERROR:0,
    INFO:1,
    WARNING:2,
    DEBUG:3
};

module.exports = Logger;