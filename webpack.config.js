const path = require('path');
const webpack = require('webpack');


module.exports = {
	entry: './src/unischeduler.ts',
	mode: "production",
	devtool: 'source-map',
	stats: 'errors-only',
	bail: true,
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	plugins: [
		new webpack.optimize.ModuleConcatenationPlugin(),
		new webpack.DefinePlugin({
			'process.env.NODE_ENV': JSON.stringify('production'),
		}),
		new webpack.ProvidePlugin({
			Buffer: ['buffer', 'Buffer'],
		})

	],
	resolve: {
		extensions: ['.tsx', '.ts', '.js'],
		fallback: {
			fs: false
		}
	},
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, 'dist'),
	},
};