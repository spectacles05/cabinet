// The Cabinet cast: hand-drawn animal doodles. One thin ink line, dot eyes, a few freckles,
// lots of white space. Every drawing shares the same stroke, eye size and freckle pattern so the
// set feels like it came from one pen. Styling (stroke, fills, motion) lives in globals.css under
// `.doodle`, so these stay plain, server-rendered SVG.

type Props = { className?: string };

export function Doodle({ viewBox, className, children }: { viewBox: string; className: string; children: React.ReactNode }) {
  return (
    <svg viewBox={viewBox} className={`doodle ${className}`} aria-hidden="true">
      {children}
    </svg>
  );
}

export function Eye({ x, y, r = 2.6 }: { x: number; y: number; r?: number }) {
  return <circle className="ink" cx={x} cy={y} r={r} />;
}

/** Three tiny dots on a cheek. */
export function Freckles({ x, y }: { x: number; y: number }) {
  return (
    <g className="ink">
      <circle cx={x} cy={y} r={0.9} />
      <circle cx={x + 2.7} cy={y + 1.5} r={0.9} />
      <circle cx={x - 0.4} cy={y + 3.1} r={0.9} />
    </g>
  );
}

/** A soft, rounded triangle nose. */
export function Nose({ x, y, w = 5 }: { x: number; y: number; w?: number }) {
  return (
    <path
      className="ink"
      d={`M${x - w} ${y} Q${x} ${y - 2} ${x + w} ${y} Q${x + 1.4} ${y + w * 1.15} ${x} ${y + w * 1.15} Q${x - 1.4} ${y + w * 1.15} ${x - w} ${y} Z`}
    />
  );
}

/** A sheet of paper: outline, folded corner and a few lines of "text". */
function Sheet({ d, fold, lines }: { d: string; fold?: string; lines?: string }) {
  return (
    <>
      <path className="paper" d={d} />
      {fold && <path d={fold} />}
      {lines && <path className="faint" d={lines} />}
    </>
  );
}

// ───────────── Empty cabinet: a rabbit peeking out of the top drawer ─────────────

export function RabbitInCabinet({ className = "h-52 w-auto" }: Props) {
  return (
    <Doodle viewBox="0 0 220 204" className={className}>
      {/* cabinet body, with gaps where the ears pass in front */}
      <path d="M92 40.5 L57 40 Q50 40 50 47 L50.5 184 Q50.5 190 57 190 L163 190.5 Q170 190.5 170 184 L169.5 47 Q169.5 40 162 40 L131 40" />
      <path d="M60 190.5 L60.5 197 M160 190.5 L159.5 197" />
      {/* the top drawer's slot, seen above the pulled-out drawer */}
      <path d="M95 50 L64 50 Q60 50 60 54 L60 84 M160 84 L160 54 Q160 50 156 50 L126 50" />
      {/* bottom drawer, closed */}
      <path d="M60 134 L160 134 L160.5 182 L60 182 Z" />
      <path d="M98 143.5 L122 143.5 L122 151.5 L98 151.5 Z M104 162 L116 162" />

      {/* the rabbit: ears, head, eyes, nose, freckles, paws on the edge */}
      <g className="doodle-wiggle">
        <path d="M114 60 C115 48, 118 32, 124 24 C130 17, 135 24, 131 34 C127 44, 122 54, 120 61" />
        <path className="faint" d="M122 48 C124 40, 127 33, 129 30" />
      </g>
      <path d="M101 61 C96 48, 91 30, 95 21 C99 13, 107 22, 108 36 C109 46, 108 54, 108 60" />
      <path className="faint" d="M100 50 C98 41, 98 32, 100 27" />
      <path d="M91 84 C89 66, 99 58, 110 58 C122 58, 131 66, 129 84" />
      <g className="doodle-blink">
        <Eye x={102} y={71} />
        <Eye x={118} y={71} />
      </g>
      <Nose x={110} y={76.5} w={3.2} />
      <Freckles x={95.5} y={75} />
      <Freckles x={122.5} y={75} />
      <path d="M84 84 C83.5 78, 92.5 78, 92 84 M128 84 C127.5 78, 136.5 78, 136 84" />

      {/* the pulled-out top drawer, in front of everything */}
      <path d="M54 84 L166 84 L165.5 124 Q165.5 126.5 163 126.5 L56.5 126 Q54 126 54 123.5 Z" />
      <path d="M98 95.5 L122 95.5 L122 103.5 L98 103.5 Z M104 113.5 L116 113.5" />
    </Doodle>
  );
}

// ───────────── Upload: a penguin carrying a policy ─────────────

export function PenguinWithPolicy({ className = "h-48 w-auto" }: Props) {
  return (
    <Doodle viewBox="0 0 200 200" className={className}>
      {/* dark hood and back, white face and front */}
      <path className="ink" d="M100 30 C124 30, 138 50, 140 80 C143 110, 146 140, 140 160 C134 176, 118 182, 100 182 C82 182, 66 176, 60 160 C54 140, 57 110, 60 80 C62 50, 76 30, 100 30 Z" />
      <path
        className="paper"
        d="M100 52 C94 44, 76 44, 74 62 C72 76, 80 86, 76 106 C72 130, 70 160, 82 172 C90 179, 110 179, 118 172 C130 160, 128 130, 124 106 C120 86, 128 76, 126 62 C124 44, 106 44, 100 52 Z"
      />
      <g className="doodle-blink">
        <Eye x={88} y={67} />
        <Eye x={112} y={67} />
      </g>
      <path className="ink" d="M95 74 Q100 72 105 74 Q101.2 82 100 82 Q98.8 82 95 74 Z" />
      <Freckles x={79.5} y={73} />
      <Freckles x={117.5} y={73} />
      {/* feet */}
      <path d="M80 180 Q81 188 92 187.5 Q95 186.5 94.5 181.5 M105.5 181.5 Q105 186.5 108 187.5 Q119 188 120 180" />
      {/* the policy, held in both flippers */}
      <Sheet
        d="M80 104 L118 99 L126 106 L129 150 L84 155 Z"
        fold="M118 99 L119 107 L126 106"
        lines="M89 116 L113 113 M89 125 L117 122 M90 134 L108 132 M91 145 Q94 140 97 144 T103 143 T109 142"
      />
      <path className="ink" d="M61 92 C54 108, 60 128, 87 139 C89 132, 81 117, 71 99 Z" />
      <path className="ink" d="M139 92 C146 108, 140 128, 113 139 C111 132, 119 117, 129 99 Z" />
    </Doodle>
  );
}

// ───────────── Reading: a hedgehog sniffing the paperwork ─────────────

type Pt = [number, number];
type Curve = [Pt, Pt, Pt, Pt];

function at(c: Curve, t: number): { p: Pt; d: Pt } {
  const u = 1 - t;
  const p: Pt = [0, 1].map((i) => u * u * u * c[0][i] + 3 * u * u * t * c[1][i] + 3 * u * t * t * c[2][i] + t * t * t * c[3][i]) as Pt;
  const d: Pt = [0, 1].map(
    (i) => 3 * u * u * (c[1][i] - c[0][i]) + 6 * u * t * (c[2][i] - c[1][i]) + 3 * t * t * (c[3][i] - c[2][i]),
  ) as Pt;
  return { p, d };
}

// Spikes along the hedgehog's back: short strokes pointing outwards, each a little different.
const BACK: Curve[] = [
  [[150, 92], [140, 70], [116, 58], [94, 60]],
  [[94, 60], [70, 62], [52, 84], [50, 134]],
];
const JITTER = [0.6, -0.4, 0.9, -0.8, 0.2, 0.7, -0.6, 0.4, -0.9, 0.5, -0.2, 0.8, -0.5, 0.3, -0.7, 0.6, -0.3, 0.9];
const SPIKES = BACK.flatMap((c, ci) =>
  Array.from({ length: 9 }, (_, i) => {
    const j = JITTER[ci * 9 + i];
    const { p, d } = at(c, ci === 0 ? 0.2 + (i / 8) * 0.75 : 0.05 + (i / 8) * 0.9);
    const len = Math.hypot(d[0], d[1]);
    const a = Math.atan2(d[0] / len, -d[1] / len) + j * 0.22; // outward normal (-dy, dx), tilted a touch
    const [nx, ny] = [Math.cos(a), Math.sin(a)];
    const r1 = 1.5;
    const r2 = 10 + Math.abs(j) * 5;
    const f = (n: number) => n.toFixed(1);
    return `M${f(p[0] + nx * r1)} ${f(p[1] + ny * r1)} L${f(p[0] + nx * r2)} ${f(p[1] + ny * r2)}`;
  }),
).join(" ");

export function HedgehogReading({ className = "h-40 w-auto" }: Props) {
  return (
    <Doodle viewBox="0 0 240 170" className={className}>
      <g transform="translate(0 20)">
        <g className="doodle-sniff">
          <path d={`M150 92 C140 70, 116 58, 94 60 C70 62, 52 84, 50 134 ${SPIKES}`} />
          <path d="M150 92 C160 98, 172 108, 179 115 C183 119, 181 124.5, 175 125 C166 126, 158 129, 151 134 L50 134" />
          <path d="M140 92 C139 85, 147 84, 148 90" />
          <Eye x={158} y={104} r={2.4} />
          <circle className="ink" cx={178} cy={119} r={2.8} />
          <Freckles x={161} y={111} />
          <path d="M78 134 C78 140, 88 140, 88 134 M126 134 C126 140, 136 140, 136 134" />
        </g>
        {/* sniff, sniff */}
        <path className="doodle-fade" d="M184.5 113 Q187 118 184.5 123" />
        <path className="doodle-fade" style={{ animationDelay: "0.25s" }} d="M189 110 Q192.5 118 189 126" />
      </g>
      {/* the paperwork */}
      <Sheet d="M201 108 L231 104 L236 148 L206 152 Z" />
      <Sheet d="M194 116 L226 114 L228 158 L196 160 Z" lines="M202 126 L220 125 M202 135 L222 134 M202 144 L215 143.5" />
      <path d="M36 160.5 Q120 158.5 238 161" className="faint" />
    </Doodle>
  );
}

// ───────────── Ask: a bear studying a document ─────────────

export function BearReading({ className = "h-48 w-auto" }: Props) {
  return (
    <Doodle viewBox="0 0 200 200" className={className}>
      <path d="M58 198 C58 150, 58 112, 60 84 C62 50, 80 32, 100 32 C121 32, 139 50, 140 84 C142 112, 142 150, 142 198" />
      <path d="M65.7 57.8 C58 50, 59 36, 70 33 C76 31.5, 81 33.5, 82.9 36.8 M134.5 57.8 C142 50, 141 36, 130 33 C124 31.5, 119 33.5, 117.2 36.8" />
      <path className="faint" d="M68 48 C67 42, 71 38, 76 39 M132 48 C133 42, 129 38, 124 39" />
      <g className="doodle-blink">
        <Eye x={91} y={70} />
        <Eye x={113} y={70} />
      </g>
      <Nose x={101} y={79} />
      <path d="M101 84.7 L101 88 M97 88.5 Q99 91 101 88.5 Q103 91 105 88.5" />
      <Freckles x={83} y={77} />
      <Freckles x={116.5} y={77} />
      {/* the document, held up close */}
      <Sheet
        d="M98 104 L140 98 L147 148 L104 154 Z"
        lines="M107 113 L133 109 M108 122 L136 118 M109 131 L128 128.5 M110 140 L131 137"
      />
      <path className="paper" d="M92 120 C86 124, 88 136, 98 136 C104 136, 106 128, 102 122 C99 119, 95 118, 92 120 Z" />
      <path className="paper" d="M150 116 C156 120, 156 132, 147 134 C141 135, 139 127, 142 121 C144 117, 147 115, 150 116 Z" />
      {/* a small question */}
      <g className="cab-float">
        <path d="M156 52 C156 44, 168 43, 168 51 C168 57, 161 57, 161 64" />
        <circle className="ink" cx={161} cy={71} r={1.8} />
      </g>
    </Doodle>
  );
}

// ───────────── Review: a fox with a magnifying glass ─────────────

export function FoxMagnifier({ className = "h-48 w-auto" }: Props) {
  return (
    <Doodle viewBox="0 0 200 200" className={className}>
      {/* tail */}
      <path d="M79 184 C50 190, 32 168, 38 147 C42 135, 51 131, 58 133 C56 146, 62 160, 78 165" />
      <path className="faint" d="M40 142 L47 148 L42 153 L50 156" />
      {/* body */}
      <path d="M84 106 C80 124, 77 150, 77 198 M116 106 C120 124, 125 150, 127 198" />
      <path className="faint" d="M88 142 L92 148 L96 143 L100 149 L104 143 L108 148 L112 142" />
      {/* head */}
      <path d="M72 80 C69 64, 66 44, 66 26 C78 34, 86 42, 91 48 C97 46, 103 46, 109 48 C114 42, 122 34, 134 26 C134 44, 131 64, 128 80 C125 96, 112 108, 100 114 C88 108, 75 96, 72 80 Z" />
      <path className="faint" d="M71 36 C74 42, 79 47, 84 49 M129 36 C126 42, 121 47, 116 49" />
      <path d="M74 84 C82 84, 90 88, 95 97 M126 84 C118 84, 110 88, 105 97" />
      <Eye x={87} y={72} />
      <Nose x={100} y={108} w={4} />
      <Freckles x={90.5} y={97} />
      <Freckles x={107} y={97} />
      {/* magnifying glass over one (now very large) eye */}
      <g className="doodle-scan">
        <circle className="paper" cx={114} cy={72} r={17} />
        <circle cx={114} cy={72} r={17} />
        <path className="faint" d="M102 66 C103 61, 107 58, 111 57.5" />
        <circle className="ink" cx={115} cy={73} r={5.2} />
        <circle className="paper-fill" cx={116.8} cy={71.2} r={1.4} />
        <path className="thick" d="M126.5 84.5 L151 109" />
        <path d="M118 128 C126 124, 132 116, 135 108 M120 138 C132 134, 141 124, 145 114" />
        <path className="paper" d="M133 104 C135 97, 145 96, 148 102 C151 108, 147 116, 140 116 C135 116, 131 110, 133 104 Z" />
      </g>
    </Doodle>
  );
}

// ───────────── All clear: a duck, delighted ─────────────

export function DuckCheer({ className = "h-48 w-auto" }: Props) {
  return (
    <Doodle viewBox="0 0 200 200" className={className}>
      {/* confetti */}
      <g className="cab-float">
        <circle className="ink" cx={58} cy={50} r={1.8} />
        <circle className="ink" cx={44} cy={66} r={1.2} />
        <circle className="ink" cx={150} cy={62} r={1.4} />
        <path d="M142 44 L148 38 M54 36 L51.5 29.5 M160 52 L166 50" />
        <path className="ink" d="M153 26 L154.2 30.8 L159 32 L154.2 33.2 L153 38 L151.8 33.2 L147 32 L151.8 30.8 Z" />
      </g>
      {/* wings up, with a flap */}
      <path className="doodle-flap-l" d="M72 112 C58 106, 48 94, 44 78 C54 84, 64 92, 73 100" />
      <path className="doodle-flap-r" d="M128 112 C142 106, 152 94, 156 78 C146 84, 136 92, 127 100" />
      <path d="M36 90 Q33 84 37 77 M164 90 Q167 84 163 77" />
      {/* body, head and tuft */}
      <path d="M78 90 C64 106, 60 150, 86 164 C96 169, 106 169, 116 164 C140 150, 136 106, 122 90" />
      <path d="M97 40.5 C116 38, 130 51, 129 68 C128 85, 115 94, 100 94 C84 94, 71 84, 71 68 C71 51, 84 40, 104 41.5" />
      <path d="M100 40 C97 32, 103 29, 103 35 C106 28, 112 31, 108 38" />
      {/* happy closed eyes, beak, freckles */}
      <path d="M85 63 Q89 58.5 93 63 M107 63 Q111 58.5 115 63" />
      <path className="ink" d="M87 74 C92 70, 108 70, 113 74 C115 78.5, 109 81.5, 100 81.5 C91 81.5, 85 78.5, 87 74 Z" />
      <Freckles x={79.5} y={70.5} />
      <Freckles x={118} y={70.5} />
      {/* feet */}
      <path d="M89 166 L86 175 L98 175 L95 166 M105 166 L102 175 L114 175 L111 166" />
    </Doodle>
  );
}

// ───────────── Peekers: heads and paws over an edge (the Ask bar, a wallet pass) ─────────────
// Each is drawn on a 120×71 canvas whose bottom edge sits on the edge being peeked over.

/** Two paws resting on the edge. */
function Paws() {
  return (
    <>
      <path className="paper-fill" d="M14 71 C13.5 63.5, 23 63.5, 22.5 71 Z M97.5 71 C97 63.5, 106.5 63.5, 106 71 Z" />
      <path d="M14 71 C13.5 63.5, 23 63.5, 22.5 71 M97.5 71 C97 63.5, 106.5 63.5, 106 71" />
    </>
  );
}

export function BearPeek({ className = "w-[84px]" }: Props) {
  return (
    <Doodle viewBox="0 0 120 71" className={className}>
      <path className="paper-fill" d="M24 71 C22 44, 38 26, 60 26 C82 26, 98 44, 96 71 Z" />
      <path d="M24 71 C22 44, 38 26, 60 26 C82 26, 98 44, 96 71" />
      <path d="M29 44 C22 38, 24 24, 34 23 C39 22.5, 42 26, 42.2 30.6 M91 44 C98 38, 96 24, 86 23 C81 22.5, 78 26, 77.8 30.6" />
      <path className="faint" d="M31 36 C31 31, 34 28.5, 37 29 M89 36 C89 31, 86 28.5, 83 29" />
      <g className="doodle-blink">
        <Eye x={50} y={50} r={2.5} />
        <Eye x={70} y={50} r={2.5} />
      </g>
      <Nose x={60} y={57} w={4} />
      <path d="M60 61.6 L60 64 M57 64.6 Q58.5 66.6 60 64.4 Q61.5 66.6 63 64.6" />
      <Freckles x={42} y={55.5} />
      <Freckles x={75.5} y={55.5} />
      <Paws />
    </Doodle>
  );
}

export function PenguinPeek({ className = "w-[84px]" }: Props) {
  return (
    <Doodle viewBox="0 0 120 71" className={className}>
      <path className="ink" d="M28 71 C26 44, 40 27, 60 27 C80 27, 94 44, 92 71 Z" />
      <path className="paper-fill" d="M60 45 C55 39, 42 39, 41 52 C40 61, 45 67, 43 71 L77 71 C75 67, 80 61, 79 52 C78 39, 65 39, 60 45 Z" />
      <g className="doodle-blink">
        <Eye x={51} y={53} r={2.5} />
        <Eye x={69} y={53} r={2.5} />
      </g>
      <path className="ink" d="M56 59 Q60 57.5 64 59 Q61 65 60 65 Q59 65 56 59 Z" />
      <Freckles x={44.5} y={58.5} />
      <Freckles x={72} y={58.5} />
      <path className="ink" d="M14 71 C15 63, 25 62, 28 71 Z M92 71 C95 62, 105 63, 106 71 Z" />
    </Doodle>
  );
}

export function RabbitPeek({ className = "w-[84px]" }: Props) {
  return (
    <Doodle viewBox="0 0 120 71" className={className}>
      <g className="doodle-wiggle">
        <path d="M64 44 C66 32, 70 16, 77 8 C84 2, 90 10, 85 20 C80 30, 74 38, 71 45" />
        <path className="faint" d="M73 34 C76 26, 80 18, 83 14" />
      </g>
      <path d="M50 45 C44 31, 40 13, 46 6 C52 0, 59 9, 58 25 C58 34, 57 40, 57 44" />
      <path className="faint" d="M48 32 C46 24, 46 16, 48 12" />
      <path className="paper-fill" d="M34 71 C32 53, 44 43, 60 43 C76 43, 88 53, 86 71 Z" />
      <path d="M34 71 C32 53, 44 43, 60 43 C76 43, 88 53, 86 71" />
      <g className="doodle-blink">
        <Eye x={52} y={58} r={2.5} />
        <Eye x={68} y={58} r={2.5} />
      </g>
      <Nose x={60} y={63} w={3.2} />
      <Freckles x={45} y={61.5} />
      <Freckles x={72.5} y={61.5} />
      <Paws />
    </Doodle>
  );
}

export function FoxPeek({ className = "w-[84px]" }: Props) {
  return (
    <Doodle viewBox="0 0 120 71" className={className}>
      {/* pointed ears and fluffy cheek tufts */}
      <path className="paper-fill" d="M31 71 L35 66 L29 62.5 L34.5 59 C33.5 52, 36 44, 41 38 L37 12 L55 28 Q60 26.5 65 28 L83 12 L79 38 C84 44, 86.5 52, 85.5 59 L91 62.5 L85 66 L89 71 Z" />
      <path d="M31 71 L35 66 L29 62.5 L34.5 59 C33.5 52, 36 44, 41 38 L37 12 L55 28 Q60 26.5 65 28 L83 12 L79 38 C84 44, 86.5 52, 85.5 59 L91 62.5 L85 66 L89 71" />
      <path className="faint" d="M41 22 C43 28, 46 32, 50 34 M79 22 C77 28, 74 32, 70 34" />
      <g className="doodle-blink">
        <Eye x={50} y={51} r={2.5} />
        <Eye x={70} y={51} r={2.5} />
      </g>
      <Nose x={60} y={62} w={3.6} />
      <Freckles x={44} y={56} />
      <Freckles x={73} y={56} />
      <Paws />
    </Doodle>
  );
}

export function DuckPeek({ className = "w-[84px]" }: Props) {
  return (
    <Doodle viewBox="0 0 120 71" className={className}>
      <path d="M58 35 C55 27, 61 24, 61 30 C64 23, 70 26, 66 33" />
      <path className="paper-fill" d="M34 71 C30 51, 42 35, 60 35 C78 35, 90 51, 86 71 Z" />
      <path d="M34 71 C30 51, 42 35, 60 35 C78 35, 90 51, 86 71" />
      <g className="doodle-blink">
        <Eye x={51} y={52} r={2.5} />
        <Eye x={69} y={52} r={2.5} />
      </g>
      <path className="ink" d="M51 59.5 C54.5 56.5, 65.5 56.5, 69 59.5 C70 63, 66 65, 60 65 C54 65, 50 63, 51 59.5 Z" />
      <Freckles x={41.5} y={57.5} />
      <Freckles x={75.5} y={57.5} />
      <Paws />
    </Doodle>
  );
}

const PEEK_SPIKES = Array.from({ length: 15 }, (_, i) => {
  const j = JITTER[i];
  const a = ((194 + (i * 152) / 14) * Math.PI) / 180 + j * 0.05;
  const [r1, r2] = [29.5, 35.5 + Math.abs(j) * 4];
  const f = (n: number) => n.toFixed(1);
  return `M${f(60 + r1 * Math.cos(a))} ${f(71 + r1 * Math.sin(a))} L${f(60 + r2 * Math.cos(a))} ${f(71 + r2 * Math.sin(a))}`;
}).join(" ");

export function HedgehogPeek({ className = "w-[84px]" }: Props) {
  return (
    <Doodle viewBox="0 0 120 71" className={className}>
      <path d={PEEK_SPIKES} />
      <path className="paper-fill" d="M33 71 C32 54, 44 43, 60 43 C76 43, 88 54, 87 71 Z" />
      <path d="M33 71 C32 54, 44 43, 60 43 C76 43, 88 54, 87 71" />
      <g className="doodle-blink">
        <Eye x={52} y={58} r={2.4} />
        <Eye x={68} y={58} r={2.4} />
      </g>
      <circle className="ink" cx={60} cy={64.5} r={2.5} />
      <Freckles x={44.5} y={61.5} />
      <Freckles x={73} y={61.5} />
      <Paws />
    </Doodle>
  );
}
