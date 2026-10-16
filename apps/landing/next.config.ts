import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  output: "export",
  devIndicators: false,
  images: {
    unoptimized: true, // Required for static export
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
