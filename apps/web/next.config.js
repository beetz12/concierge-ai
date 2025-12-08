/** @type {import('next').NextConfig} */
const nextConfig = {
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
