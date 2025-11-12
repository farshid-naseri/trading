import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  // رفع خطای Cross Origin برای پیش‌نمایش آنلاین
  allowedDevOrigins: [
    'https://preview-chat-*.space.z.ai'
  ],
  // 禁用 Next.js 热重载،由 nodemon 处理重编译
  reactStrictMode: false,
  webpack: (config, { dev }) => {
    if (dev) {
      // 禁用 webpack 的热模块替换
      config.watchOptions = {
        ignored: ['**/*'], // 忽略所有文件变化
      };
    }
    
    // Handle lightweight-charts ES module
    config.module.rules.push({
      test: /lightweight-charts/,
      resolve: {
        fullySpecified: false,
      },
    });
    
    return config;
  },
  eslint: {
    // 构建时忽略ESLint错误
    ignoreDuringBuilds: true,
  },
  // Configure transpilation for lightweight-charts
  transpilePackages: ['lightweight-charts'],
  // Ignore favicon error
  experimental: {
    optimizeCss: false,
  },
};

export default nextConfig;
