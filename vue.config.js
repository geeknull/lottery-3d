module.exports = {
    // https://cli.vuejs.org/zh/config/#lintonsave
    lintOnSave: 'error', // [true, false, 'error', 'warning', 'default']
    configureWebpack: config => {
        // 线上开启debugger
        if (config.mode === 'production') {
            config.optimization.minimizer[0].options.terserOptions.compress.drop_debugger = false;
        }
    },
    chainWebpack: config => {
        config.plugin('define').tap(args => {
            // 添加环境变量
            args[0]['process.env.CONFIG_ENV'] = JSON.stringify(process.env.CONFIG_ENV);
            return args;
        });
        config.plugin('html').tap(args => {
            args[0].title = '【GitHub】2077年终大抽奖';
            return args;
        });
    },
    devServer: {
        port: 8080,
        host: '',
        disableHostCheck: true
    }
};
