// The picture on the front of each policy folder: a small scene drawn with the cast's pen, objects
// cut from paper, and a soft wash in the folder's own colour. Used wherever a policy is pictured.
import { Doodle, Eye, Freckles } from "./animals";
import { folderTones, washTone } from "./theme";

function Travel() {
  return (
    <>
      <circle className="wash" cx={58} cy={50} r={30} />
      {/* a cloud drifting past the sun */}
      <path className="paper" d="M20 40 Q20 33 27 33 Q29 26 36 27 Q43 25 45 32 Q51 32 51 38 Q51 41 47 41 L23 41 Q20 41 20 40 Z" />
      {/* the suitcase, its shadow in wash */}
      <rect className="wash" x={64} y={49} width={46} height={54} rx={7} />
      <rect className="paper" x={58} y={44} width={46} height={54} rx={7} />
      <path d="M72 44 L72 36 Q72 32 76 32 L86 32 Q90 32 90 36 L90 44" />
      <path className="faint" d="M67 45 L67 97 M95 45 L95 97" />
      <circle className="paper" cx={66} cy={101.5} r={3.2} />
      <circle className="paper" cx={96} cy={101.5} r={3.2} />
      {/* stickers */}
      <circle className="paper" cx={81} cy={62} r={6.5} />
      <path className="faint" d="M76.5 63 Q78.8 60.5 81 63 T85.5 63" />
      <path className="paper" d="M73 77 L88 75 L89 84 L74 86 Z" />
      <path className="faint" d="M77 80.5 L85 79.5" />
      {/* a paper plane, off somewhere */}
      <path className="dash" d="M96 30 C104 22, 112 38, 122 33" />
      <path className="paper" d="M118 31 L141 20 L133 41 L128.5 33 Z" />
      <path d="M128.5 33 L141 20" />
      <path className="faint" d="M48 105 L120 105" />
    </>
  );
}

function Contents() {
  return (
    <>
      <ellipse className="wash" cx={80} cy={100} rx={56} ry={7} />
      <circle className="wash" cx={124} cy={44} r={20} />
      {/* a picture on the wall */}
      <rect className="paper" x={36} y={20} width={24} height={19} rx={1.5} />
      <path className="faint" d="M39.5 35.5 L45.5 28.5 L49.5 32.5 L52.5 29.5 L57 35.5" />
      {/* floor lamp */}
      <path d="M124 40 L124 98" />
      <path d="M117 99 L131 99" />
      <path className="paper" d="M112 40 L136 40 L130 22 L118 22 Z" />
      {/* the armchair */}
      <path className="paper" d="M56 72 L56 57 Q56 45 68 45 L90 45 Q102 45 102 57 L102 72 Z" />
      <path className="faint" d="M66 52 Q79 49 92 52" />
      <rect className="paper" x={53} y={70} width={52} height={15} rx={5} />
      <rect className="paper" x={42} y={61} width={15} height={28} rx={7} />
      <rect className="paper" x={101} y={61} width={15} height={28} rx={7} />
      <path d="M47 89 L45.5 98 M111 89 L112.5 98" />
      {/* a plant */}
      <path className="paper" d="M25 83 C17 80, 12 72, 14 63 C21 67, 25 74, 25 83 Z" />
      <path className="paper" d="M25 83 C27 72, 31 66, 38 63 C38 72, 33 79, 25 83 Z" />
      <path className="paper" d="M25 83 C21 75, 21 66, 25 56 C29 66, 29 75, 25 83 Z" />
      <path className="paper" d="M17 83 L33 83 L31 98 L19 98 Z" />
    </>
  );
}

function Gadget() {
  return (
    <>
      <circle className="wash" cx={122} cy={42} r={22} />
      {/* laptop */}
      <path className="paper" d="M41 28 L107 28 Q111 28 111 32 L111 76 L37 76 L37 32 Q37 28 41 28 Z" />
      <path className="faint" d="M44 35 L104 35 L104 69 L44 69 Z" />
      <path className="faint" d="M51 47 L73 47 M51 55 L83 55 M51 63 L66 63" />
      <circle className="wash" cx={92} cy={50} r={6} />
      <path className="paper" d="M31 76 L117 76 L123 84 Q123 88 119 88 L29 88 Q25 88 25 84 Z" />
      <path className="faint" d="M66 80.5 L82 80.5" />
      {/* phone, leaning */}
      <g transform="rotate(9 130 70)">
        <rect className="paper" x={119} y={49} width={22} height={40} rx={4.5} />
        <path className="faint" d="M126.5 54 L133.5 54" />
        <circle className="ink" cx={130} cy={83.5} r={1.5} />
      </g>
      {/* coffee */}
      <path className="paper" d="M9 72 L25 72 L23.5 88 L10.5 88 Z" />
      <path d="M25 76 Q31 76 30 81 Q29 85 24 84" />
      <path className="faint" d="M14 66 C12 62, 16 60, 14 56 M20 66 C18 62, 22 60, 20 56" />
      <path className="faint" d="M4 89 L156 89" />
    </>
  );
}

function Car() {
  return (
    <>
      <circle className="wash" cx={128} cy={30} r={15} />
      <rect className="wash" x={4} y={92} width={152} height={7} rx={3.5} />
      <path className="faint dash" d="M14 95.5 L150 95.5" />
      {/* a roadside tree */}
      <path d="M145 66 L145 92 M145 78 L149.5 73.5" />
      <path className="paper" d="M134 60 Q133 50 141 48 Q144 41 151 44 Q158 45 157 53 Q161 58 156 63 Q153 68 145 67 Q137 68 134 60 Z" />
      <path className="faint" d="M14 66 L25 66 M9 72 L22 72" />
      {/* the car */}
      <path className="paper-fill" d="M34 80 L34 71 Q34 65 40 64 L52 62 L63 50 Q66 47 71 47 L96 47 Q101 47 104 51 L114 62 L122 63.5 Q127 64.5 127 70 L127 80 Z" />
      <path d="M42 80 L34 80 L34 71 Q34 65 40 64 L52 62 L63 50 Q66 47 71 47 L96 47 Q101 47 104 51 L114 62 L122 63.5 Q127 64.5 127 70 L127 80 L118 80 M98 80 L62 80" />
      <path className="wash" d="M67 61 L72 52.5 Q73.5 51 76 51 L82 51 L82 61 Z M88 51 L96 51 Q99 51 101 53.5 L107 61 L88 61 Z" />
      <path d="M67 61 L72 52.5 Q73.5 51 76 51 L82 51 L82 61 Z M88 51 L96 51 Q99 51 101 53.5 L107 61 L88 61 Z" />
      <path className="faint" d="M85 64 L85 76 M121 67.5 L125 68" />
      <circle className="paper" cx={52} cy={81} r={9.5} />
      <circle className="paper" cx={108} cy={81} r={9.5} />
      <circle className="ink" cx={52} cy={81} r={2.6} />
      <circle className="ink" cx={108} cy={81} r={2.6} />
    </>
  );
}

function Pet() {
  return (
    <>
      <circle className="wash" cx={80} cy={58} r={38} />
      {/* body and tail, behind the head */}
      <path d="M99 92 C110 92, 115 84, 111 77" />
      <path className="paper" d="M64 72 C57 82, 57 99, 66 99 L94 99 C103 99, 103 82, 96 72 Z" />
      <path className="faint" d="M72 99 L72 91 M88 99 L88 91" />
      {/* head */}
      <path className="paper" d="M62 52 C62 38, 71 31, 80 31 C89 31, 98 38, 98 52 C98 68, 90 78, 80 78 C70 78, 62 68, 62 52 Z" />
      <path className="paper" d="M66 38 C56 36, 48 52, 53 66 C57 68, 62 60, 64 52 C65 47, 66 42, 66 38 Z" />
      <path className="paper" d="M94 38 C104 36, 112 52, 107 66 C103 68, 98 60, 96 52 C95 47, 94 42, 94 38 Z" />
      <Eye x={73} y={52} />
      <Eye x={87} y={52} />
      <ellipse className="ink" cx={80} cy={61} rx={4.2} ry={3} />
      <path d="M80 64 L80 67 M76 67.5 Q78 70 80 67.3 Q82 70 84 67.5" />
      <Freckles x={67.5} y={57.5} />
      <Freckles x={90.5} y={57.5} />
      <path d="M67 74 Q80 82 93 74" />
      {/* name tag: a little heart */}
      <path className="wash" d="M80 82 C77.5 79.5, 74 81.5, 76 85 L80 89 L84 85 C86 81.5, 82.5 79.5, 80 82 Z" />
      <path d="M80 82 C77.5 79.5, 74 81.5, 76 85 L80 89 L84 85 C86 81.5, 82.5 79.5, 80 82 Z" />
      {/* a bone, and the bowl */}
      <path className="paper" d="M23 95 C20 92, 16 95, 19 98 C16 101, 20 104, 23 101 L41 101 C44 104, 48 101, 45 98 C48 95, 44 92, 41 95 Z" />
      <path className="paper" d="M114 92 L144 92 Q142 103 129 103 Q116 103 114 92 Z" />
      <path className="wash" d="M117 92 Q129 87 141 92 Z" />
    </>
  );
}

function Health() {
  return (
    <>
      <circle className="wash" cx={80} cy={58} r={36} />
      <path className="paper" d="M80 94 C60 80, 45 67, 45 50 C45 38, 54 30, 65 30 C72 30, 77 34, 80 40 C83 34, 88 30, 95 30 C106 30, 115 38, 115 50 C115 67, 100 80, 80 94 Z" />
      <path d="M52 60 L66 60 L71 49 L78 71 L84 55 L88 60 L108 60" />
      {/* a capsule */}
      <path className="paper" d="M118 96 L131 83 Q135 79 139 83 Q143 87 139 91 L126 104 Q122 108 118 104 Q114 100 118 96 Z" />
      <path className="wash" d="M124.5 89.5 L131 83 Q135 79 139 83 Q143 87 139 91 L132.5 97.5 Z" />
      <path d="M124.5 89.5 L132.5 97.5" />
      <path className="faint" d="M133 18 L133 28 M128 23 L138 23 M24 34 L24 42 M20 38 L28 38" />
    </>
  );
}

function Life() {
  return (
    <>
      <ellipse className="wash" cx={80} cy={102} rx={48} ry={6} />
      <path className="wash" d="M44 66 C44 44, 62 30, 84 30 C106 30, 124 44, 124 66 C118 60, 110 60, 104 66 C98 60, 90 60, 84 66 C78 60, 70 60, 64 66 C58 60, 50 60, 44 66 Z" />
      <path d="M80 26 L80 20" />
      <path className="paper" d="M40 62 C40 40, 58 26, 80 26 C102 26, 120 40, 120 62 C114 56, 106 56, 100 62 C94 56, 86 56, 80 62 C74 56, 66 56, 60 62 C54 56, 46 56, 40 62 Z" />
      <path className="faint" d="M80 27 C71 37, 67 49, 69 61 M80 27 C89 37, 93 49, 91 61" />
      <path d="M80 62 L80 92 Q80 98 74 98 Q68 98 68 92" />
      {/* a seedling, kept dry */}
      <path className="paper" d="M92 90 L104 90 L102.5 101 L93.5 101 Z" />
      <path d="M98 90 L98 80" />
      <path className="paper" d="M98 82 C93 82, 89 79, 89 74 C94 74, 98 77, 98 82 Z" />
      <path className="paper" d="M98 80 C103 80, 107 77, 107 72 C102 72, 98 75, 98 80 Z" />
      {/* rain, everywhere else */}
      <path className="faint" d="M24 34 L22 40 M18 58 L16 64 M28 80 L26 86 M136 30 L134 36 M140 56 L138 62 M132 82 L130 88" />
    </>
  );
}

function Other() {
  return (
    <>
      <circle className="wash" cx={76} cy={58} r={34} />
      <path className="paper" d="M56 20 L92 20 L106 34 L106 98 L56 98 Z" />
      <path d="M92 20 L92 34 L106 34" />
      <path className="faint" d="M66 48 L96 48 M66 58 L96 58 M66 68 L84 68" />
      <path d="M67 85 Q70 79 73 84 T79 83 T85 82" />
      {/* the seal */}
      <circle className="wash" cx={104} cy={88} r={12} />
      <circle cx={104} cy={88} r={12} />
      <path d="M98.5 88 L102.5 92 L109.5 84" />
      {/* a pen */}
      <path className="paper" d="M114 54 L136 22 L141 25.5 L119 57.5 Z" />
      <path d="M114 54 L112.5 61 L119 57.5" />
    </>
  );
}

const BY_TYPE: Record<string, () => React.ReactElement> = {
  travel: Travel,
  contents: Contents,
  renters: Contents,
  gadget: Gadget,
  car: Car,
  pet: Pet,
  health: Health,
  life: Life,
};

export function PolicyScene({ type, className = "h-[150px] w-[200px]" }: { type: string; className?: string }) {
  const Art = BY_TYPE[type] ?? Other;
  return (
    <span className="contents" style={{ "--doodle-wash": washTone(type) } as React.CSSProperties}>
      <Doodle viewBox="0 0 160 120" className={className}>
        <Art />
      </Doodle>
    </span>
  );
}

/** A policy's picture on a small piece of its folder, for rows and lists. */
export function SceneTile({ type, className = "h-11 w-14" }: { type: string; className?: string }) {
  const { front, back } = folderTones(type);
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-[10px] ${className}`} style={{ background: front, boxShadow: `inset 0 2px 0 ${back}` }}>
      <PolicyScene type={type} className="h-auto w-[88%]" />
    </span>
  );
}
