import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "S3 Dock — S3, finally usable.",
  description:
    "A modern web UI for S3, R2, MinIO, and anything else that speaks the protocol. Browse, search, and move files like it's a drive.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "S3 Dock — S3, finally usable.",
    description:
      "A modern web UI for S3-compatible storage. Browse, search, and move files like it's a drive.",
    type: "website",
    url: "/",
    siteName: "S3 Dock",
  },
  twitter: {
    card: "summary_large_image",
    title: "S3 Dock — S3, finally usable.",
    description:
      "A modern web UI for S3-compatible storage. Browse, search, and move files like it's a drive.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "S3 Dock",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: "https://s3dock.app",
      description:
        "A modern web UI for S3, R2, MinIO, and anything else that speaks the protocol.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "Organization",
      name: "S3 Dock",
      url: "https://s3dock.app",
      logo: "https://s3dock.app/logo.png",
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
