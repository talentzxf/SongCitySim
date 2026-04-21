import { palette } from '../../theme/palette'

/** 居家市民（静止站在民居旁） */
export default function ResidentAvatar({ x, y, seed, selected, onClick }: {
  x: number; y: number; seed: number; selected?: boolean; onClick?: (e: any) => void
}) {
  const ox = Math.sin(seed) * 0.22
  const oz = Math.cos(seed * 1.7) * 0.22
  const color = seed % 2 === 0 ? palette.character.robe : palette.character.robeAccent
  return (
    <group position={[x + ox, 0, y + oz]} onClick={onClick}>
      {/* Hit cylinder: top at y=0.80 (above building priority plane at y=0.55)
          so clicking on a resident beats the building plane.
          Radius 0.22 = resident offset, so it doesn't reach the building centre. */}
      <mesh position={[0, 0.40, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.80, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <capsuleGeometry args={[0.04, 0.12, 3, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      <mesh position={[0, 0.39, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.08, 0.08, 6]} />
        <meshStandardMaterial color={palette.character.hat} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.18, 20]} />
          <meshBasicMaterial color="#52c41a" />
        </mesh>
      )}
    </group>
  )
}

