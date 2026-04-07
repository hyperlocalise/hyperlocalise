import React from "react"

type Blob = {
  x: string
  y: string
  size: string
  color: string
  opacity?: number
}

type BlurBackgroundProps = {
  blobs?: Blob[]
  className?: string
  children?: React.ReactNode
  blurClassName?: string
  baseColor?: string
  vignette?: boolean
}

const defaultBlobs: Blob[] = [
  { x: "-8%", y: "0%", size: "30rem", color: "#6d28d9", opacity: 0.6 },
  { x: "12%", y: "42%", size: "28rem", color: "#c026d3", opacity: 0.5 },
  { x: "38%", y: "2%", size: "28rem", color: "#fb923c", opacity: 0.5 },
  { x: "78%", y: "-4%", size: "28rem", color: "#65a30d", opacity: 0.5 },
  { x: "76%", y: "72%", size: "28rem", color: "#22d3ee", opacity: 0.45 },
]

export function BlurBackground({
  blobs = defaultBlobs,
  className = "",
  children,
  blurClassName = "blur-3xl saturate-[1.15]",
  baseColor = "#0b0b10",
  vignette = true,
}: BlurBackgroundProps) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: baseColor }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className={`absolute inset-[-10%] ${blurClassName}`}>
          {blobs.map((blob, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: blob.x,
                top: blob.y,
                width: blob.size,
                height: blob.size,
                backgroundColor: blob.color,
                opacity: blob.opacity ?? 0.5,
              }}
            />
          ))}
        </div>

        {vignette && (
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 45%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.75) 100%)",
            }}
          />
        )}
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  )
}
