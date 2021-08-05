const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, './src/client/index.tsx'),
  devtool: 'source-map',
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
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist', 'client'),
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
          template: path.resolve(__dirname, "./src/client/templates/index.html")
      })
  ]
};
