import HtmlInlineScriptPlugin from "html-inline-script-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Configuration } from "webpack";
import webpack from "webpack";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default (env: unknown, argv: { mode?: string }): Configuration => ({
  mode: argv.mode === "production" ? "production" : "development",
  devtool: argv.mode === "production" ? false : "inline-source-map",
  context: rootDir,
  entry: {
    ui: path.join(rootDir, "src/ui.tsx"),
    code: path.join(rootDir, "src/code.ts"),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    alias: {
      src: path.join(rootDir, "src"),
    },
  },
  output: {
    filename: (pathData) => {
      return pathData.chunk?.name === "code" ? "code.js" : "[name].[contenthash].js";
    },
    path: path.join(rootDir, "dist"),
    clean: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      global: {},
    }),
    new HtmlWebpackPlugin({
      inject: "body",
      template: path.join(rootDir, "src/ui.html"),
      filename: "ui.html",
      chunks: ["ui"],
    }),
    new HtmlInlineScriptPlugin({
      htmlMatchPattern: [/ui.html/],
      scriptMatchPattern: [/.js$/],
    }),
  ],
});
