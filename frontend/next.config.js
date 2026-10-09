const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // COOP/COEP headers removed in v2.2 — Mediabunny (pure TS) doesn't need SharedArrayBuffer.
  webpack: (config) => {
    // Exclude Node.js-only native modules from the browser bundle.
    // kokoro-js → @huggingface/transformers → onnxruntime-node has native .node binaries
    // that webpack can't bundle. The browser uses onnxruntime-web instead.

    // 1. Alias onnxruntime-node to empty module so imports resolve to nothing
    config.resolve.alias['onnxruntime-node'] = require.resolve('./src/lib/empty-module.js');

    // 1b. Alias onnxruntime-web to the CJS browser build (ort.min.js) instead of the
    // ESM bundle (ort.bundle.min.mjs) which uses import.meta — incompatible with
    // Next.js static export minification. ort.min.js loads WASM externally from
    // /wasm/ort/ (copied by scripts/setup-assets.sh).
    config.resolve.alias['onnxruntime-web'] = require('path').resolve(__dirname, 'node_modules/onnxruntime-web/dist/ort.min.js');

    // 2. Provide Node.js polyfill fallbacks for browser (face-api.js tries to import 'fs')
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      encoding: false,
    };

    // 3. Ignore the dynamic context require that pulls in .node binaries
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /onnxruntime_binding\.node$/,
      })
    );

    // 4. Ignore Node.js-specific ONNX runtime entry (uses createRequire + import.meta)
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /ort\.node\.min\.mjs$/,
      })
    );

    // 5. Handle any remaining .node files gracefully
    config.module.rules.push({
      test: /\.node$/,
      use: 'null-loader',
    });

    return config;
  },
};

module.exports = nextConfig;
