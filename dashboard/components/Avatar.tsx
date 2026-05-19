"use client";

import { ACCENT_RING, avatarUrl, EmployeeMeta } from "@/lib/employees";

interface Props {
  employee: Pick<EmployeeMeta, "name" | "avatarSeed" | "accent">;
  size?: number; // px
  ring?: boolean;
  online?: boolean;
  className?: string;
}

export default function Avatar({
  employee,
  size = 40,
  ring = false,
  online = false,
  className = "",
}: Props) {
  const url = avatarUrl(employee.avatarSeed, size * 2);
  const ringClass = ring ? `ring-2 ring-offset-2 ring-offset-bg ${ACCENT_RING[employee.accent]}` : "";

  return (
    <div className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={employee.name}
        width={size}
        height={size}
        className={[
          "rounded-full bg-surface-2 object-cover",
          ringClass,
        ].join(" ")}
        style={{ width: size, height: size }}
      />
      {online && (
        <span
          className="absolute bottom-0 right-0 block rounded-full border-2 border-bg bg-ok"
          style={{
            width: Math.max(8, size / 4),
            height: Math.max(8, size / 4),
          }}
        />
      )}
    </div>
  );
}
