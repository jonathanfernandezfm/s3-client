import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://s3dock.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/sign-in", "/sign-up", "/s/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
