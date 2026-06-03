import Image from "next/image";
import { Cloud, Shield, Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding/Marketing */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-zinc-900 to-zinc-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <Image src="/logo.png" alt="S3 Dock" width={40} height={40} className="invert" />
          <span className="font-bold text-2xl text-white">
            S3 Dock
          </span>
        </div>

        {/* Main content */}
        <div className="space-y-8 relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Manage your S3 storage
            <br />
            <span className="text-zinc-400">with ease</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-md">
            Connect to any S3-compatible storage, browse buckets,
            upload files, and manage your data from one unified interface.
          </p>

          {/* Features */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-3 text-zinc-300">
              <div className="p-2 bg-white/5 rounded-lg">
                <Cloud className="h-5 w-5" />
              </div>
              <span>Connect to AWS S3, MinIO, and more</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <div className="p-2 bg-white/5 rounded-lg">
                <Shield className="h-5 w-5" />
              </div>
              <span>Secure credential management</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <div className="p-2 bg-white/5 rounded-lg">
                <Zap className="h-5 w-5" />
              </div>
              <span>Fast uploads with progress tracking</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-sm text-zinc-500 relative z-10">
          Secure, fast, and intuitive cloud storage management.
        </p>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
