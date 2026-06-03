"use client";

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-orange-500",
];

function hashColor(userId: string | null): string {
  if (!userId) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  userId,
  displayName,
  imageUrl,
  size = 24,
}: {
  userId: string | null;
  displayName: string;
  imageUrl: string | null;
  size?: number;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={displayName}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const color = hashColor(userId);
  return (
    <span
      className={`${color} rounded-full shrink-0 flex items-center justify-center text-white font-semibold select-none`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(displayName)}
    </span>
  );
}
