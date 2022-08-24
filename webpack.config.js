const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, './src/web/index.tsx'),
  devtool: false,
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      'usb': false
    }
  },
  output: {
    filename: '[name].[contenthash].bundle.js',
    path: path.resolve(__dirname, 'dist', 'web'),
    clean: true
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        'vendor': {
            name: 'vendor',
            test: /[\\/]node_modules[\\/]/,
            chunks: 'initial',
            priority: 1
        },
      }
    }
  },
  plugins: [
      new HtmlWebpackPlugin({
          template: path.resolve(__dirname, "./src/web/templates/index.html")
      }),
      new webpack.SourceMapDevToolPlugin({
        filename: '[file].map',
        exclude: [/vendor\.(.+?)\.bundle\.js/]
      })
  ]
};
