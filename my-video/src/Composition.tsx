import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from "remotion";

const FPS = 30;
const SCENE_DURATIONS = [90, 160, 150, 140, 150, 160, 180] as const;
const FINAL_SCENE_INDEX = SCENE_DURATIONS.length - 1;
const FINAL_HOLD_FRAMES = 60;
export const VIDEO_DURATION_IN_FRAMES =
  SCENE_DURATIONS.reduce((sum, duration) => sum + duration, 0) +
  FINAL_HOLD_FRAMES;

const COLORS = {
  background: "#0f0f0f",
  surface: "#2a2d33",
  border: "#3a3f47",
  accentBlue: "#096ce5",
  successGreen: "#22c55e",
  warningAmber: "#f59e0b",
  text: "#fafafa",
  mutedText: "#a4a3b4",
};

const SLACK_COLORS = {
  aubergine: "#4A154B",
  aubergineDark: "#350D36",
  rail: "#3F0E40",
  mentionBlue: "#36C5F0",
  highlightYellow: "#ECB22E",
  alertRed: "#E01E5A",
  onlineGreen: "#2EB67D",
};

const ASSET_IMAGES = {
  before: "stripe-en.png",
  after: "stripe-vn.png",
};

const UI_FONT =
  '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.45, 0, 0.55, 1);

const sceneStarts = SCENE_DURATIONS.reduce<number[]>(
  (starts, duration, index) => {
    starts.push(
      index === 0 ? 0 : starts[index - 1] + SCENE_DURATIONS[index - 1],
    );
    return starts;
  },
  [],
);

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const enter = (frame: number, delay = 0, duration = 24) =>
  interpolate(frame, [delay, delay + duration], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

const exit = (frame: number, duration: number, leave = 22) =>
  interpolate(frame, [duration - leave, duration], [1, 0], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });

const sceneOpacity = (frame: number, duration: number) =>
  Math.min(enter(frame, 0, 28), exit(frame, duration, 18));

const slowZoom = (frame: number, duration: number, from = 0.965, to = 1.018) =>
  interpolate(frame, [0, duration], [from, to], {
    ...clamp,
    easing: easeInOut,
  });

const springScale = (frame: number, delay = 0) => {
  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps: FPS,
    config: {
      damping: 34,
      mass: 0.8,
      stiffness: 120,
    },
  });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1], clamp),
    transform: `scale(${interpolate(progress, [0, 1], [0.96, 1], clamp)})`,
  };
};

const glass: CSSProperties = {
  background: "rgba(248, 250, 252, 0.055)",
  border: "1px solid rgba(248, 250, 252, 0.11)",
  boxShadow: "0 34px 100px rgba(0, 0, 0, 0.30)",
  backdropFilter: "blur(24px)",
};

const keynoteHeadline: CSSProperties = {
  color: COLORS.text,
  fontFamily: UI_FONT,
  fontSize: 44,
  fontWeight: 700,
  letterSpacing: 0,
  lineHeight: 1.04,
  margin: 0,
};

const keynoteSubhead: CSSProperties = {
  color: COLORS.mutedText,
  fontFamily: UI_FONT,
  fontSize: 21,
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1.35,
  margin: 0,
};

const dotColors = ["#ff5f57", "#febc2e", "#28c840"];

const LogoIcon = ({ size = 24 }: { size?: number }) => (
  <Img
    src={staticFile("logo.png")}
    style={{
      display: "block",
      height: size,
      objectFit: "contain",
      width: size,
    }}
  />
);

const BellaAvatar = ({ size = 38 }: { size?: number }) => (
  <Img
    src={staticFile("bella.png")}
    style={{
      background: COLORS.text,
      border: "1px solid rgba(248,250,252,0.18)",
      borderRadius: 12,
      display: "block",
      height: size,
      objectFit: "cover",
      objectPosition: "50% 62%",
      width: size,
    }}
  />
);

type AnimatedBlockProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  style?: CSSProperties;
};

const AnimatedBlock = ({
  children,
  delay = 0,
  duration = 26,
  style,
}: AnimatedBlockProps) => {
  const frame = useCurrentFrame();
  const progress = enter(frame, delay, duration);
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [14, 0])}px) scale(${interpolate(
          progress,
          [0, 1],
          [0.975, 1],
        )})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type SceneShellProps = {
  children: ReactNode;
  duration: number;
  zoomFrom?: number;
  zoomTo?: number;
};

const SceneShell = ({
  children,
  duration,
  zoomFrom,
  zoomTo,
}: SceneShellProps) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity(frame, duration),
        transform: `scale(${slowZoom(frame, duration, zoomFrom, zoomTo)})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const AmbientBackground = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(
    frame,
    [0, VIDEO_DURATION_IN_FRAMES],
    [0, 44],
    clamp,
  );
  const finalGlow = interpolate(
    frame,
    [sceneStarts[FINAL_SCENE_INDEX] + 30, VIDEO_DURATION_IN_FRAMES - 20],
    [0, 1],
    clamp,
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -80,
          background:
            "linear-gradient(135deg, rgba(248,250,252,0.025), rgba(9,108,229,0.025) 42%, transparent 74%)",
          transform: `translate3d(${drift * -0.25}px, ${drift * 0.16}px, 0)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 112%, rgba(9,108,229,0.16), transparent 46%), radial-gradient(ellipse at 50% -18%, rgba(248,250,252,0.055), transparent 58%)",
          opacity: 0.52 + finalGlow * 0.22,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.42), transparent 22%, transparent 78%, rgba(0,0,0,0.38)), linear-gradient(180deg, rgba(0,0,0,0.22), transparent 34%, rgba(0,0,0,0.52))",
        }}
      />
    </AbsoluteFill>
  );
};

type SlackWindowProps = {
  children: ReactNode;
  channel?: string;
  style?: CSSProperties;
};

const SlackWindow = ({
  children,
  channel = "#help-localisation",
  style,
}: SlackWindowProps) => (
  <div
    style={{
      background: "#1d1c1d",
      border: "1px solid rgba(248,250,252,0.12)",
      boxShadow: "0 36px 110px rgba(0, 0, 0, 0.34)",
      borderRadius: 28,
      color: COLORS.text,
      fontFamily: UI_FONT,
      overflow: "hidden",
      position: "relative",
      textAlign: "left",
      ...style,
    }}
  >
    <div
      style={{
        alignItems: "center",
        background: SLACK_COLORS.aubergine,
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        display: "flex",
        height: 54,
        padding: "4px 20px 0",
        gap: 14,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", gap: 7 }}>
        {dotColors.map((color) => (
          <span
            key={color}
            style={{
              background: color,
              borderRadius: 999,
              display: "block",
              height: 10,
              width: 10,
            }}
          />
        ))}
      </div>
      <div
        style={{
          color: COLORS.text,
          fontSize: 16,
          fontWeight: 750,
          letterSpacing: 0,
        }}
      >
        {channel}
      </div>
      <div
        style={{
          color: "rgba(248,250,252,0.72)",
          fontSize: 13,
          marginLeft: "auto",
        }}
      >
        Hyperlocalise Agent
      </div>
    </div>
    <div
      style={{
        background: "#1d1c1d",
        minHeight: "calc(100% - 52px)",
        padding: 24,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  </div>
);

type MessageProps = {
  author: string;
  children: ReactNode;
  bot?: boolean;
  delay?: number;
  compact?: boolean;
};

const Message = ({
  author,
  children,
  bot = false,
  delay = 0,
  compact = false,
}: MessageProps) => (
  <AnimatedBlock delay={delay} style={{ marginBottom: compact ? 14 : 18 }}>
    <div style={{ display: "flex", gap: 13, textAlign: "left" }}>
      <div
        style={{
          alignItems: "center",
          background: bot
            ? "rgba(248,250,252,0.1)"
            : `linear-gradient(135deg, ${SLACK_COLORS.aubergine}, ${SLACK_COLORS.aubergineDark})`,
          border: `1px solid ${bot ? "rgba(255,255,255,0.25)" : COLORS.border}`,
          borderRadius: 14,
          color: COLORS.text,
          display: "flex",
          flex: "0 0 auto",
          fontFamily: UI_FONT,
          fontSize: bot ? 19 : 14,
          fontWeight: 700,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        {bot ? <LogoIcon size={23} /> : <BellaAvatar size={38} />}
      </div>
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <div style={{ alignItems: "baseline", display: "flex", gap: 9 }}>
          <span style={{ color: COLORS.text, fontSize: 15, fontWeight: 700 }}>
            {author}
          </span>
          <span style={{ color: COLORS.mutedText, fontSize: 12 }}>now</span>
        </div>
        <div
          style={{
            color: COLORS.text,
            fontSize: compact ? 15 : 16,
            lineHeight: 1.45,
            marginTop: 5,
            textAlign: "left",
            whiteSpace: "pre-wrap",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  </AnimatedBlock>
);

type ProgressiveTextProps = {
  text: string;
  start: number;
  end: number;
};

const ProgressiveText = ({ text, start, end }: ProgressiveTextProps) => {
  const frame = useCurrentFrame();
  const chars = Array.from(text);
  const count = Math.floor(
    interpolate(frame, [start, end], [0, chars.length], clamp),
  );
  const caretOpacity = frame < end && Math.floor(frame / 10) % 2 === 0 ? 1 : 0;
  const visible = chars.slice(0, count).join("");
  return (
    <>
      <SlackInlineText text={visible} />
      <span style={{ color: COLORS.accentBlue, opacity: caretOpacity }}>
        {" "}
        |
      </span>
    </>
  );
};

const SlackMention = ({ children }: { children: ReactNode }) => (
  <span style={{ color: SLACK_COLORS.mentionBlue, fontWeight: 800 }}>
    {children}
  </span>
);

const SlackInlineText = ({ text }: { text: string }) => (
  <>
    {text
      .split(/(@[A-Za-z][A-Za-z0-9_-]*)/g)
      .map((part, index) =>
        part.startsWith("@") ? (
          <SlackMention key={`${part}-${index}`}>{part}</SlackMention>
        ) : (
          part
        ),
      )}
  </>
);

type HeadlineBlockProps = {
  headline: ReactNode;
  subhead?: ReactNode;
  delay?: number;
  style?: CSSProperties;
  headlineStyle?: CSSProperties;
};

const HeadlineBlock = ({
  headline,
  subhead,
  delay = 0,
  style,
  headlineStyle,
}: HeadlineBlockProps) => (
  <AnimatedBlock delay={delay} duration={32} style={style}>
    <h1 style={{ ...keynoteHeadline, ...headlineStyle }}>{headline}</h1>
    {subhead ? (
      <p style={{ ...keynoteSubhead, marginTop: 16 }}>{subhead}</p>
    ) : null}
  </AnimatedBlock>
);

type AppleStageProps = {
  children: ReactNode;
  duration: number;
  headline: ReactNode;
  subhead?: ReactNode;
  contentDelay?: number;
  contentStyle?: CSSProperties;
  headlineStyle?: CSSProperties;
  zoomFrom?: number;
  zoomTo?: number;
};

const AppleStage = ({
  children,
  duration,
  headline,
  subhead,
  contentDelay = 34,
  contentStyle,
  headlineStyle,
  zoomFrom,
  zoomTo,
}: AppleStageProps) => (
  <SceneShell duration={duration} zoomFrom={zoomFrom} zoomTo={zoomTo}>
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "50px 72px 42px",
        textAlign: "center",
      }}
    >
      <HeadlineBlock
        delay={0}
        headline={headline}
        headlineStyle={{
          fontSize: 54,
          lineHeight: 1.02,
          maxWidth: 900,
          ...headlineStyle,
        }}
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
        }}
        subhead={subhead}
      />
      <AnimatedBlock
        delay={contentDelay}
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "center",
          marginTop: 34,
          width: "100%",
          ...contentStyle,
        }}
      >
        {children}
      </AnimatedBlock>
    </div>
  </SceneShell>
);

const Reactions = ({ delay = 0 }: { delay?: number }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 10, marginLeft: 52, marginTop: -4 }}>
      {["👀 Product", "✅ Marketing"].map((label, index) => {
        const p = enter(frame, delay + index * 8, 18);
        return (
          <div
            key={label}
            style={{
              background: "rgba(248,250,252,0.08)",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 999,
              color: COLORS.mutedText,
              fontSize: 13,
              fontWeight: 700,
              opacity: p,
              padding: "5px 10px",
              transform: `scale(${interpolate(p, [0, 1], [0.88, 1])})`,
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
};

const CodeViewer = ({ delay = 0 }: { delay?: number }) => {
  const frame = useCurrentFrame();
  const highlight = enter(frame, delay + 34, 24);
  const lines = [
    "export function PaymentActions() {",
    "  return (",
    '    <Button size="sm">',
    '      {t("checkout.continue")}',
    "    </Button>",
    "  );",
    "}",
  ];

  return (
    <AnimatedBlock
      delay={delay}
      style={{
        ...glass,
        borderRadius: 22,
        overflow: "hidden",
        textAlign: "left",
      }}
    >
      <div
        style={{
          alignItems: "center",
          borderBottom: `1px solid ${COLORS.border}`,
          color: COLORS.mutedText,
          display: "flex",
          fontFamily: UI_FONT,
          fontSize: 13,
          height: 48,
          padding: "0 18px",
          textAlign: "left",
        }}
      >
        apps/web/checkout/payment.tsx
      </div>
      <div style={{ padding: "18px 20px 20px" }}>
        {lines.map((line, index) => {
          const isHighlighted = index === 2 || index === 3 || index === 4;
          return (
            <div
              key={line}
              style={{
                background: isHighlighted
                  ? `rgba(9,108,229,${0.08 + highlight * 0.12})`
                  : "transparent",
                border: isHighlighted
                  ? `1px solid rgba(9,108,229,${0.18 + highlight * 0.22})`
                  : "1px solid transparent",
                borderRadius: 9,
                color: isHighlighted ? COLORS.text : COLORS.mutedText,
                fontFamily: UI_FONT,
                fontSize: 16,
                lineHeight: "30px",
                padding: "0 10px",
                margin: '8px 0px',
                textAlign: "left",
              }}
            >
              <span
                style={{
                  color: "rgba(148,163,184,0.48)",
                  display: "inline-block",
                  width: 24,
                }}
              >
                {index + 7}
              </span>
              {line}
            </div>
          );
        })}
      </div>
    </AnimatedBlock>
  );
};

const ConstraintBadges = ({ delay = 0 }: { delay?: number }) => {
  const badges = [
    "Button width: 128px",
    "Mobile layout: strict",
    "Max JA length: 8-10 chars",
  ];
  return (
    <AnimatedBlock delay={delay}>
      <div
        style={{
          color: COLORS.mutedText,
          fontFamily: UI_FONT,
          fontSize: 14,
          fontWeight: 650,
          marginTop: 14,
          textAlign: "left",
        }}
      >
        {badges.join(" · ")}
      </div>
    </AnimatedBlock>
  );
};

const Button = ({
  children,
  primary = false,
  active = false,
}: {
  children: ReactNode;
  primary?: boolean;
  active?: boolean;
}) => (
  <div
    style={{
      background: primary ? COLORS.accentBlue : "rgba(248,250,252,0.08)",
      border: `1px solid ${
        primary ? "rgba(255,255,255,0.18)" : "rgba(248,250,252,0.10)"
      }`,
      borderRadius: 999,
      boxShadow: active ? "0 0 0 6px rgba(9,108,229,0.14)" : "none",
      color: COLORS.text,
      fontFamily: UI_FONT,
      fontSize: 13,
      fontWeight: 750,
      lineHeight: 1.15,
      padding: "11px 17px",
      transform: active ? "scale(0.96)" : "scale(1)",
    }}
  >
    {children}
  </div>
);

const Cursor = ({
  delay = 0,
  x = 0,
  y = 0,
}: {
  delay?: number;
  x?: number;
  y?: number;
}) => {
  const frame = useCurrentFrame();
  const p = enter(frame, delay, 24);
  const click = spring({
    frame: Math.max(0, frame - delay - 36),
    fps: FPS,
    config: { damping: 18, stiffness: 160, mass: 0.7 },
  });
  return (
    <div
      style={{
        left: x + interpolate(p, [0, 1], [-35, 0]),
        opacity: p,
        position: "absolute",
        top: y + interpolate(p, [0, 1], [25, 0]),
        transform: `scale(${interpolate(click, [0, 1], [1, 0.86], clamp)})`,
        zIndex: 10,
      }}
    >
      <div
        style={{
          borderBottom: "12px solid transparent",
          borderLeft: `18px solid ${COLORS.text}`,
          borderTop: "12px solid transparent",
          filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.45))",
          height: 0,
          transform: "rotate(-18deg)",
          width: 0,
        }}
      />
    </div>
  );
};

const Flow = ({ delay = 0 }: { delay?: number }) => {
  const frame = useCurrentFrame();
  const nodes = ["Slack request", "locale file", "GitHub PR"];
  return (
    <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
      {nodes.map((node, index) => {
        const p = enter(frame, delay + index * 16, 22);
        return (
          <div
            key={node}
            style={{ alignItems: "center", display: "flex", gap: 12 }}
          >
            <div
              style={{
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: COLORS.mutedText,
                display: "flex",
                fontFamily: UI_FONT,
                fontSize: 14,
                fontWeight: 750,
                height: 28,
                justifyContent: "center",
                opacity: p,
                padding: 0,
                transform: `scale(${interpolate(p, [0, 1], [0.96, 1])})`,
                width: 108,
              }}
            >
              {node}
            </div>
            {index < nodes.length - 1 ? (
              <div
                style={{
                  color: COLORS.accentBlue,
                  fontFamily: UI_FONT,
                  fontSize: 20,
                  fontWeight: 700,
                  opacity: enter(frame, delay + index * 16 + 12, 18),
                }}
              >
                →
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const PullRequestCard = ({ delay = 0 }: { delay?: number }) => (
  <AnimatedBlock
    delay={delay}
    style={{
      padding: "4px 0",
      textAlign: "left",
      width: 410,
    }}
  >
    <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
      <div
        style={{
          alignItems: "center",
          background: "transparent",
          border: "1px solid rgba(34,197,94,0.38)",
          borderRadius: 999,
          color: COLORS.successGreen,
          display: "flex",
          fontSize: 18,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        ✓
      </div>
      <div>
        <div
          style={{
            color: COLORS.mutedText,
            fontFamily: UI_FONT,
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          GitHub pull request
        </div>
        <div
          style={{
            color: COLORS.text,
            fontFamily: UI_FONT,
            fontSize: 22,
            fontWeight: 800,
            lineHeight: 1.22,
          }}
        >
          Localise checkout CTA for ja-JP
        </div>
      </div>
    </div>
    <div
      style={{
        background: "transparent",
        borderTop: "1px solid rgba(248,250,252,0.10)",
        color: COLORS.mutedText,
        fontFamily: UI_FONT,
        fontSize: 13,
        fontWeight: 650,
        lineHeight: 1.6,
        marginTop: 18,
        paddingTop: 14,
      }}
    >
      + "checkout.continue": "購入へ進む"
      <br />
      ✓ UI constraint checked
      <br />✓ Ready for review
    </div>
  </AnimatedBlock>
);

type PromoBannerProps = {
  market: "before" | "after";
  compact?: boolean;
};

const PromoBanner = ({ market, compact = false }: PromoBannerProps) => {
  const isAfter = market === "after";
  const width = compact ? 440 : 520;
  const height = compact ? 205 : 260;
  return (
    <div
      style={{
        background: "rgba(16,18,22,0.96)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: compact ? 18 : 24,
        boxShadow: "0 26px 70px rgba(0,0,0,0.34)",
        height,
        overflow: "hidden",
        position: "relative",
        width,
      }}
    >
      <Img
        src={staticFile(isAfter ? ASSET_IMAGES.after : ASSET_IMAGES.before)}
        style={{
          display: "block",
          height: "100%",
          objectFit: "cover",
          width: "100%",
        }}
      />
      <div
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.18), transparent 18%, transparent 82%, rgba(0,0,0,0.22))",
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
      />
    </div>
  );
};

const LogoMark = ({
  delay = 0,
  large = false,
}: {
  delay?: number;
  large?: boolean;
}) => {
  const frame = useCurrentFrame();
  const reveal = springScale(frame, delay);
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: large ? 18 : 12,
        ...reveal,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          height: large ? 84 : 54,
          justifyContent: "center",
          width: large ? 84 : 54,
        }}
      >
        <LogoIcon size={large ? 54 : 34} />
      </div>
      <div
        style={{
          color: COLORS.text,
          fontFamily: UI_FONT,
          fontSize: large ? 54 : 28,
          fontWeight: 600,
          letterSpacing: 0,
        }}
      >
        Hyperlocalise
      </div>
    </div>
  );
};

const SceneOne = ({ duration }: { duration: number }) => (
  <SceneShell duration={duration} zoomFrom={0.96} zoomTo={1.01}>
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <AnimatedBlock delay={8}>
        <div
          style={{
            color: COLORS.mutedText,
            fontFamily: UI_FONT,
            fontSize: 24,
            fontWeight: 650,
            marginBottom: 28,
          }}
        >
          Introducing
        </div>
      </AnimatedBlock>
      <LogoMark delay={38} large />
    </div>
  </SceneShell>
);

const SceneThree = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const sent = frame > 78;
  const ask =
    "@Hyperlocalise can you localise 'Continue to checkout' for Japan?\nCheck TM, glossary on Phrase, and the context where it appears in code.";

  return (
    <AppleStage
      duration={duration}
      headline="Ask in Slack."
      subhead="No ticket. No context switching. Just ask."
      zoomFrom={0.97}
      zoomTo={1.012}
    >
      <SlackWindow style={{ height: 366, width: 660 }}>
        <Message author="Bella Wu" delay={8}>
          <ProgressiveText text={ask} start={24} end={76} />
        </Message>
        {sent ? <Reactions delay={84} /> : null}
        <AnimatedBlock
          delay={92}
          style={{
            borderTop: "1px solid rgba(248,250,252,0.08)",
            marginLeft: 52,
            marginTop: 30,
            paddingTop: 20,
            textAlign: "left",
          }}
        >
          <div
            style={{
              color: COLORS.mutedText,
              fontFamily: UI_FONT,
              fontSize: 14,
              fontWeight: 650,
            }}
          >
            Hyperlocalise is working on the request...
          </div>
        </AnimatedBlock>
      </SlackWindow>
    </AppleStage>
  );
};

const SceneFour = ({ duration }: { duration: number }) => (
  <AppleStage
    duration={duration}
    headline="Translation with context"
    subhead="Understands layout, intent, and code before translating."
  >
    <div
      style={{ alignItems: "center", display: "flex", flexDirection: "column" }}
    >
      <div style={{ width: 620 }}>
        <CodeViewer delay={0} />
        <ConstraintBadges delay={42} />
      </div>

    </div>
  </AppleStage>
);

const SceneFive = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const active = frame > 48 && frame < 62;

  return (
    <AppleStage
      duration={duration}
      headline="From Slack to PR."
      subhead="Approve once. Hyperlocalise updates the locale file and opens the pull request."
      contentStyle={{ marginTop: 32 }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 42 }}>
          <SlackWindow style={{ height: 312, width: 860 }}>
            <Message author="Hyperlocalise" bot delay={0}>
              Want me to update ja-JP.json and open a PR?
            </Message>
            <AnimatedBlock
              delay={18}
              style={{
                display: "flex",
                gap: 10,
                marginLeft: 52,
                marginTop: 14,
              }}
            >
              <Button>Approve</Button>
              <Button>Ask reviewer</Button>
              <Button active={active} primary>
                Create PR
              </Button>
            </AnimatedBlock>
          </SlackWindow>
          <Cursor delay={30} x={440} y={168} />
        </div>
    </AppleStage>
  );
};

const SceneSix = ({ duration }: { duration: number }) => (
  <AppleStage
    duration={duration}
    headline="Assets, not just strings."
    subhead="Drop a graphic in Slack and ask for a market-ready version."
  >
    <SlackWindow style={{ height: 398, width: 620 }}>
      <Message author="Bella Wu" delay={0}>
        <SlackMention>@Hyperlocalise</SlackMention> localise this graphic for
        Vietnam. Make sure you use our glossary in Smartling
      </Message>
      <AnimatedBlock delay={28} style={{ marginLeft: 52, marginTop: 12 }}>
        <PromoBanner compact market="before" />
      </AnimatedBlock>
    </SlackWindow>
  </AppleStage>
);

const SceneSeven = ({ duration }: { duration: number }) => (
  <AppleStage
    duration={duration}
    headline="Rebuilt for the market."
    subhead="The output is composed for the market, not merely translated."
    contentStyle={{ flexDirection: "column", marginTop: 30 }}
  >
    <div style={{ alignItems: "center", display: "flex", gap: 24, marginTop: 32}}>
      <AnimatedBlock delay={0}>
        <div>
          <div
            style={{
              color: COLORS.mutedText,
              fontFamily: UI_FONT,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 0,
              marginBottom: 10,
            }}
          >
            Before
          </div>
          <PromoBanner compact market="before" />
        </div>
      </AnimatedBlock>
      <AnimatedBlock delay={22}>
        <div>
          <div
            style={{
              color: COLORS.successGreen,
              fontFamily: UI_FONT,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 0,
              marginBottom: 10,
            }}
          >
            After
          </div>
          <PromoBanner compact market="after" />
        </div>
      </AnimatedBlock>
    </div>
    <AnimatedBlock
      delay={70}
      style={{
        borderRadius: 999,
        marginTop: 26,
        padding: "14px 20px",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <LogoIcon size={24} />
        <div
          style={{
            color: COLORS.text,
            fontFamily: UI_FONT,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Copy adjusted. Layout rebuilt.
        </div>
      </div>
    </AnimatedBlock>
  </AppleStage>
);

const SceneEight = ({ duration }: { duration: number }) => {

  return (
    <SceneShell duration={duration} zoomFrom={0.96} zoomTo={1.02}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "58px 58px",
          position: "relative",
          textAlign: "center",
        }}
      >
        <LogoMark delay={6} />
        <HeadlineBlock
          delay={34}
          headline="Agentic Localization Platform"
          headlineStyle={{ fontSize: 52, marginTop: 64, maxWidth: 900 }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        />
        <AnimatedBlock delay={118} style={{ marginTop: 24,  }}>

          <div
            style={{
              color: COLORS.mutedText,
              fontFamily: UI_FONT,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            hyperlocalise.com
          </div>
            <div
              style={{
                background: COLORS.text,
                borderRadius: 999,
                color: COLORS.background,
                fontFamily: UI_FONT,
                fontSize: 18,
                fontWeight: 900,
              padding: "14px 24px",
                marginTop: 56
              }}
            >
              Join the Waitlist
            </div>
        </AnimatedBlock>
      </div>
    </SceneShell>
  );
};

const AudioBed = () => (
  <Audio
    src={staticFile("prettyjohn1-background-music-505061.mp3")}
    volume={(frame) => {
      const fadeIn = interpolate(frame, [0, FPS], [0, 0.35], clamp);
      const fadeOut = interpolate(
        frame,
        [VIDEO_DURATION_IN_FRAMES - 2 * FPS, VIDEO_DURATION_IN_FRAMES],
        [0.35, 0],
        clamp,
      );
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

export const HyperlocaliseLaunch = () => (
  <AbsoluteFill
    style={{ backgroundColor: COLORS.background, fontFamily: UI_FONT }}
  >
    <AmbientBackground />
    <AudioBed />
    <Sequence from={sceneStarts[0]} durationInFrames={SCENE_DURATIONS[0]}>
      <SceneOne duration={SCENE_DURATIONS[0]} />
    </Sequence>
    <Sequence from={sceneStarts[1]} durationInFrames={SCENE_DURATIONS[1]}>
      <SceneThree duration={SCENE_DURATIONS[1]} />
    </Sequence>
    <Sequence from={sceneStarts[2]} durationInFrames={SCENE_DURATIONS[2]}>
      <SceneFour duration={SCENE_DURATIONS[2]} />
    </Sequence>
    <Sequence from={sceneStarts[3]} durationInFrames={SCENE_DURATIONS[3]}>
      <SceneFive duration={SCENE_DURATIONS[3]} />
    </Sequence>
    <Sequence from={sceneStarts[4]} durationInFrames={SCENE_DURATIONS[4]}>
      <SceneSix duration={SCENE_DURATIONS[4]} />
    </Sequence>
    <Sequence from={sceneStarts[5]} durationInFrames={SCENE_DURATIONS[5]}>
      <SceneSeven duration={SCENE_DURATIONS[5]} />
    </Sequence>
    <Sequence
      from={sceneStarts[6]}
      durationInFrames={SCENE_DURATIONS[6] + FINAL_HOLD_FRAMES}
    >
      <SceneEight duration={SCENE_DURATIONS[6] + FINAL_HOLD_FRAMES} />
    </Sequence>
  </AbsoluteFill>
);
