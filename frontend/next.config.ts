import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  serverExternalPackages: ["@zama-fhe/relayer-sdk"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      child_process: false
    };

    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false
    };

    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        message: /Circular dependency between chunks with runtime/
      }
    ];
    return config;
  }
};

export default nextConfig;
