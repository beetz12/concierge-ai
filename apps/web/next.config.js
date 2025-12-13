/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase proxy timeout for long-running Kestra workflows (default is ~30s)
  // Kestra research flows can take 45-60 seconds
  experimental: {
    proxyTimeout: 120_000, // 2 minutes in milliseconds
  },

  // Proxy API calls to backend in local development
  // Production uses vercel.json rewrites (takes precedence on Vercel)
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
