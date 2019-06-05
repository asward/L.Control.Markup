const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
    plugins: [
        new MiniCssExtractPlugin({
            // Options similar to the same options in webpackOptions.output
            // both options are optional
            filename: 'L.Control.Markup.css',
            chunkFilename: 'L.Control.Markup.css',
        }),
    ],
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            // you can specify a publicPath here
                            // by default it uses publicPath in webpackOptions.output
                            publicPath: '../',
                            hmr: process.env.NODE_ENV === 'development',
                        },
                    },
                    'css-loader',
                ],
            },
            {
                test: /\.svg$/,
                use: [
                    {
                        loader: 'svg-inline-loader',
                        options: {
                            removeTags: true,
                            removingTags: ['metadata'],
                            removeSVGTagAttrs: false
                        }
                    }
                ],
            }
        ],
    },
    entry: './src/js/L.Control.Markup.js',
    mode: "development",
    watch: true,
    output: {
        filename: 'L.Control.Markup.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'var',
        library: 'markup',
        globalObject: 'this.L.markup.'

    },
    devtool: 'source-map',
    
};