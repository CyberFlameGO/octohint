// @ts-check
const path = require('path')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  watch: true,
  entry: {
    background: './src/background',
    'content-script': './src/content-script',
    options: './src/options',
  },
  output: {
    path: path.resolve('chrome/dist'),
    filename: '[name].js',
    publicPath: '/dist/',
  },
  // Enable sourcemaps for debugging webpack's output.
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.(j|t)sx?$/,
        use: {
          loader: 'swc-loader',
        },
        sideEffects: false, // TODO: figure out why bytemd Editor is bundled by default
        // exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
    fallback: {
      path: 'path-browserify',
    },
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      filename: 'options.html',
      chunks: ['options'],
    }),
  ],
}
