import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Excel upload — эх файл 0.9 MB, нөөцтэйгээр 50 MB
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
